import { expect } from 'chai'
import {
  BLEAdvertisement,
  BLEGattConnection,
  BLEProvider,
  GATTSubscriptionHandle
} from '@signalk/server-api'
import { BLEApi } from '../src/api/ble'

/**
 * A plugin that gives up on a GATT connection before it is up releases the
 * device. The connection must not end up claimed by the plugin when it
 * arrives later: nothing would ever close it, and the plugin's next attempt
 * would be refused as a claim of its own.
 */

const MAC = 'AA:BB:CC:DD:EE:FF'
const PROVIDER_ID = 'test-gateway'
const PLUGIN_ID = 'consumer-plugin'
const OTHER_PLUGIN_ID = 'other-plugin'
const GATT_SLOTS = 3
const RSSI = -60
const SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb'

// Settled by the test, standing in for a connection that takes a while
class Deferred<T> {
  resolve: (value: T) => void = () => undefined
  readonly promise = new Promise<T>((resolve) => {
    this.resolve = resolve
  })
}

const fakeConnection = () => {
  let closes = 0
  const connection: BLEGattConnection = {
    read: async () => Buffer.alloc(0),
    write: async () => undefined,
    startNotifications: async () => undefined,
    stopNotifications: async () => undefined,
    discoverServices: async () => [],
    disconnect: async () => {
      closes++
    },
    get connected() {
      return closes === 0
    },
    onDisconnect: () => undefined
  }
  return { connection, closes: () => closes }
}

const fakeSession = () => {
  let closes = 0
  const handle: GATTSubscriptionHandle = {
    read: async () => Buffer.alloc(0),
    write: async () => undefined,
    close: async () => {
      closes++
    },
    get connected() {
      return closes === 0
    },
    onDisconnect: () => undefined,
    onConnect: () => undefined
  }
  return { handle, closes: () => closes }
}

const startApi = () => {
  const api = new BLEApi({
    config: { settings: {} }
  } as unknown as ConstructorParameters<typeof BLEApi>[0])
  const connects: Deferred<BLEGattConnection>[] = []
  const subscribes: Deferred<GATTSubscriptionHandle>[] = []
  let advertise: (adv: BLEAdvertisement) => void = () => undefined
  const provider: BLEProvider = {
    name: 'Test gateway',
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
      subscribeGATT: () => {
        const subscribing = new Deferred<GATTSubscriptionHandle>()
        subscribes.push(subscribing)
        return subscribing.promise
      },
      connectGATT: () => {
        const connecting = new Deferred<BLEGattConnection>()
        connects.push(connecting)
        return connecting.promise
      }
    }
  }
  api.register(PROVIDER_ID, provider)
  // The device has to be seen by a provider before it can be claimed
  advertise({
    mac: MAC,
    rssi: RSSI,
    providerId: PROVIDER_ID,
    timestamp: Date.now(),
    connectable: true
  })
  return { api, connects, subscribes }
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: Error) => e
  )

describe('BLE GATT claim released while connecting', () => {
  it('closes a connectGATT() connection that comes up after the release', async () => {
    const { api, connects } = startApi()
    const connecting = api.connectGATT(MAC, PLUGIN_ID)

    await api.releaseGATTDevice(MAC, PLUGIN_ID)
    const late = fakeConnection()
    connects[0].resolve(late.connection)

    expect((await rejection(connecting))?.message).to.match(
      /released while connecting/
    )
    expect(late.closes()).to.equal(1)
    expect(api.getGATTClaims().size).to.equal(0)

    // The device is free for the plugin's next attempt
    const retrying = api.connectGATT(MAC, PLUGIN_ID)
    connects[1].resolve(fakeConnection().connection)
    await retrying
    expect(api.getGATTClaims().get(MAC)).to.equal(PLUGIN_ID)
  })

  it('closes a subscribeGATT() session that comes up after the release', async () => {
    const { api, subscribes } = startApi()
    const subscribing = api.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID },
      PLUGIN_ID,
      () => undefined
    )

    await api.releaseGATTDevice(MAC, PLUGIN_ID)
    const late = fakeSession()
    subscribes[0].resolve(late.handle)

    expect((await rejection(subscribing))?.message).to.match(
      /released while connecting/
    )
    expect(late.closes()).to.equal(1)
    expect(api.getGATTClaims().size).to.equal(0)
  })

  it('leaves a claim in progress alone when another plugin releases the device', async () => {
    const { api, connects } = startApi()
    const connecting = api.connectGATT(MAC, PLUGIN_ID)

    await api.releaseGATTDevice(MAC, OTHER_PLUGIN_ID)
    const arriving = fakeConnection()
    connects[0].resolve(arriving.connection)

    await connecting
    expect(arriving.closes()).to.equal(0)
    expect(api.getGATTClaims().get(MAC)).to.equal(PLUGIN_ID)
  })
})
