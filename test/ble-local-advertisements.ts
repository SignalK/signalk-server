import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import Module from 'node:module'
import { BLEAdvertisement } from '@signalk/server-api'
import { LocalBLEProvider } from '../src/api/ble/localProvider'

const MAC = 'AA:BB:CC:DD:EE:FF'
const ADAPTER = 'hci0'
const DEVICE_NODE = 'dev_AA_BB_CC_DD_EE_FF'
const DEVICE_IFACE = 'org.bluez.Device1'
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties'
const SERVICE_UUID = '0000feab-0000-1000-8000-00805f9b34fb'
const ADVERTISEMENT_TIMEOUT_MS = 1000

type Properties = Record<string, { value: unknown }>

class FakeBus extends EventEmitter {
  readonly properties = new EventEmitter()
  private readonly busDaemon = new EventEmitter()
  getAllCalls = 0

  constructor(private readonly values: Properties) {
    super()
  }

  async getProxyObject(service: string) {
    if (service === 'org.freedesktop.DBus') {
      return { nodes: [], getInterface: () => this.busDaemon }
    }
    return {
      nodes: [],
      getInterface: (iface: string) =>
        iface === PROPERTIES_IFACE
          ? Object.assign(this.properties, {
              GetAll: async () => {
                this.getAllCalls++
                return this.values
              },
              Get: async (_interface: string, name: string) => this.values[name]
            })
          : {}
    }
  }

  change(values: Properties) {
    Object.assign(this.values, values)
    this.properties.emit('PropertiesChanged', DEVICE_IFACE, values, [])
  }
}

type Requirer = (this: unknown, id: string, ...rest: unknown[]) => unknown
const patchable = Module as unknown as { prototype: { require: Requirer } }
const realRequire = patchable.prototype.require
type DeviceCtor = new (bus: FakeBus, adapter: string, device: string) => object
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Device = require('@naugehyde/node-ble/src/Device') as DeviceCtor

const startProvider = async (values: Properties) => {
  const bus = new FakeBus(values)
  const provider = new LocalBLEProvider(ADAPTER)
  const adapter = {
    isPowered: async () => true,
    devices: async () => [MAC],
    waitDevice: async () => new Device(bus, ADAPTER, DEVICE_NODE),
    helper: { callMethod: async () => undefined }
  }
  patchable.prototype.require = function (
    this: unknown,
    id: string,
    ...rest: unknown[]
  ) {
    if (id === '@naugehyde/node-ble') {
      return {
        createBluetooth: () => ({
          bluetooth: { dbus: bus, getAdapter: async () => adapter },
          destroy: () => undefined
        })
      }
    }
    return realRequire.call(this, id, ...rest)
  }
  let ready: Promise<void>
  try {
    ready = provider.init()
  } finally {
    patchable.prototype.require = realRequire
  }
  await ready
  return { provider, bus }
}

const nextAdvertisement = (provider: LocalBLEProvider) => {
  let unsubscribe = () => {}
  return new Promise<BLEAdvertisement>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('No advertisement received'))
    }, ADVERTISEMENT_TIMEOUT_MS)
    unsubscribe = provider.onAdvertisement((advertisement) => {
      clearTimeout(timer)
      unsubscribe()
      resolve(advertisement)
    })
  })
}

describe('Local BLE provider initial device properties', () => {
  let provider: LocalBLEProvider | undefined

  afterEach(() => {
    provider?.shutdown()
    provider = undefined
  })

  it('publishes the name and advertising data already known by BlueZ', async () => {
    const started = await startProvider({
      Name: { value: 'Known Beacon' },
      RSSI: { value: -78 },
      ManufacturerData: { value: { 76: { value: Buffer.from([1, 2]) } } },
      ServiceData: {
        value: { [SERVICE_UUID]: { value: Buffer.from([3, 4]) } }
      },
      UUIDs: { value: [SERVICE_UUID] }
    })
    provider = started.provider
    const first = nextAdvertisement(provider)
    await provider.startDiscovery()
    const advertisement = await first
    expect(advertisement).to.include({
      mac: MAC,
      name: 'Known Beacon',
      rssi: -78
    })
    expect(advertisement.manufacturerData).to.deep.equal({ 76: '0102' })
    expect(advertisement.serviceData).to.deep.equal({ [SERVICE_UUID]: '0304' })
    expect(advertisement.serviceUuids).to.deep.equal([SERVICE_UUID])
    expect(started.bus.getAllCalls).to.equal(1)
  })

  it('publishes a device with no optional name', async () => {
    const started = await startProvider({ RSSI: { value: -65 } })
    provider = started.provider
    const first = nextAdvertisement(provider)
    await provider.startDiscovery()
    const advertisement = await first
    expect(advertisement.name).to.equal(undefined)
    expect(advertisement.rssi).to.equal(-65)
  })

  it('continues receiving property changes after the initial snapshot', async () => {
    const started = await startProvider({
      Name: { value: 'Known Beacon' },
      RSSI: { value: -78 }
    })
    provider = started.provider
    const first = nextAdvertisement(provider)
    await provider.startDiscovery()
    await first
    const changed = nextAdvertisement(provider)
    started.bus.change({
      Name: { value: 'Renamed beacon' },
      RSSI: { value: -60 }
    })
    expect(await changed).to.include({ name: 'Renamed beacon', rssi: -60 })
    expect(started.bus.getAllCalls).to.equal(1)
  })
})
