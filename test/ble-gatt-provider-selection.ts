import { expect } from 'chai'
import {
  BLEAdvertisement,
  BLEGattConnection,
  BLEProvider,
  GATTSubscriptionHandle
} from '@signalk/server-api'
import { BLEApi } from '../src/api/ble'

/**
 * A GATT operation goes to the provider that hears the device best, among
 * those that can carry it out. Gateways run subscription sessions but make
 * no raw connections, so a raw connection must not go to a gateway that
 * merely hears the device better than the local adapter.
 */

const MAC = 'AA:BB:CC:DD:EE:FF'
const GATEWAY_ID = 'ble:gateway:test'
const LOCAL_ID = '_localBLE:hci0'
const PLUGIN_ID = 'consumer-plugin'
const SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb'
const GATT_SLOTS = 3
const NEAR = -50
const FAR = -80

const connection = (): BLEGattConnection => ({
  read: async () => Buffer.alloc(0),
  write: async () => undefined,
  startNotifications: async () => undefined,
  stopNotifications: async () => undefined,
  discoverServices: async () => [],
  disconnect: async () => undefined,
  connected: true,
  onDisconnect: () => undefined
})

const session = (): GATTSubscriptionHandle => ({
  read: async () => Buffer.alloc(0),
  write: async () => undefined,
  close: async () => undefined,
  connected: true,
  onDisconnect: () => undefined,
  onConnect: () => undefined
})

/** A provider that records which GATT operations reached it. */
const provider = (name: string, makesConnections: boolean) => {
  const calls: string[] = []
  let advertise: (adv: BLEAdvertisement) => void = () => undefined
  const ble: BLEProvider = {
    name,
    methods: {
      startDiscovery: async () => undefined,
      stopDiscovery: async () => undefined,
      getDevices: async () => [MAC],
      onAdvertisement: (callback) => {
        advertise = callback
        return () => undefined
      },
      supportsGATT: () => true,
      availableGATTSlots: () => GATT_SLOTS,
      subscribeGATT: async () => {
        calls.push('subscribe')
        return session()
      },
      ...(makesConnections && {
        connectGATT: async () => {
          calls.push('connect')
          return connection()
        }
      })
    }
  }
  return {
    ble,
    calls,
    hears: (providerId: string, rssi: number) =>
      advertise({
        mac: MAC,
        rssi,
        providerId,
        timestamp: Date.now(),
        connectable: true
      })
  }
}

type Handler = (
  req: { params: Record<string, string> },
  res: { status(code: number): unknown; json(body: unknown): unknown }
) => unknown

/** An application that only records the routes the API registers. */
const fakeApp = () => {
  const posts = new Map<string, Handler>()
  const record = () => undefined
  const app = {
    config: { settings: {} },
    server: { on: () => undefined },
    use: record,
    get: record,
    put: record,
    delete: record,
    post: (path: string, handler: Handler) => {
      posts.set(path, handler)
    }
  }
  return {
    app: app as unknown as ConstructorParameters<typeof BLEApi>[0],
    posts
  }
}

/** The API with a gateway and, unless left out, the local adapter. */
const startApi = (withLocalAdapter = true) => {
  const { app, posts } = fakeApp()
  const api = new BLEApi(app)
  const gateway = provider('Gateway', false)
  const local = provider('Local adapter', true)
  api.register(GATEWAY_ID, gateway.ble)
  gateway.hears(GATEWAY_ID, NEAR)
  if (withLocalAdapter) {
    api.register(LOCAL_ID, local.ble)
    local.hears(LOCAL_ID, FAR)
  }
  return { api, posts, gateway, local }
}

describe('BLE GATT provider selection', () => {
  it('makes a raw connection through the local adapter when a gateway hears the device better', async () => {
    const { api, gateway, local } = startApi()

    await api.connectGATT(MAC, PLUGIN_ID)

    expect(local.calls).to.deep.equal(['connect'])
    expect(gateway.calls).to.deep.equal([])
  })

  it('still subscribes through the gateway that hears the device best', async () => {
    const { api, gateway, local } = startApi()

    await api.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID },
      PLUGIN_ID,
      () => undefined
    )

    expect(gateway.calls).to.deep.equal(['subscribe'])
    expect(local.calls).to.deep.equal([])
  })

  it('refuses a raw connection when only gateways hear the device', async () => {
    const { api, gateway } = startApi(false)

    const error = await api.connectGATT(MAC, PLUGIN_ID).then(
      () => undefined,
      (e: Error) => e
    )

    expect(error?.message).to.match(
      /No provider with raw GATT connections and available slots/
    )
    expect(gateway.calls).to.deep.equal([])
    expect(api.getGATTClaims().size).to.equal(0)
  })

  it('makes a raw connection through the local adapter though a gateway is the default provider', async () => {
    const { api, posts, gateway, local } = startApi()
    await api.start()
    let status = 200
    await posts.get(
      '/signalk/v2/api/vessels/self/ble/_providers/_default/:id'
    )!(
      { params: { id: GATEWAY_ID } },
      {
        status(code: number) {
          status = code
          return this
        },
        json() {
          return this
        }
      }
    )
    expect(status).to.equal(200)

    await api.connectGATT(MAC, PLUGIN_ID)

    expect(local.calls).to.deep.equal(['connect'])
    expect(gateway.calls).to.deep.equal([])
  })
})
