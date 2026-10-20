import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import Module from 'node:module'
import { mock } from 'node:test'
import { LocalBLEProvider } from '../src/api/ble/localProvider'

/**
 * The local provider subscribes to PropertiesChanged of every device BlueZ
 * lists, through the real node-ble Device. Each subscription holds a match
 * rule on the system bus, so one that outlives its device stays there for
 * good: an anchorage full of phones with random addresses would keep adding
 * them.
 */

const ADAPTER = 'hci0'
const MAX_SLOTS = 3
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties'
const BUS_DAEMON = 'org.freedesktop.DBus'
// The provider's device-watch interval
const DEVICE_WATCH_INTERVAL_MS = 5000
// Enough event-loop turns for the provider's pending D-Bus work to run
const SETTLE_TURNS = 20

const PHONE = 'AA:BB:CC:00:00:01'
const SENSOR = 'AA:BB:CC:00:00:02'

const nodeOf = (mac: string) => `dev_${mac.replace(/:/g, '_')}`
const pathOf = (mac: string) => `/org/bluez/${ADAPTER}/${nodeOf(mac)}`

// One Properties proxy per lookup, as dbus-next hands out. A PropertiesChanged
// listener on any of them keeps the device's match rule on the bus.
class FakeBus {
  private readonly proxies = new Map<string, EventEmitter[]>()

  async getProxyObject(service: string, path: string) {
    if (service === BUS_DAEMON) {
      return { nodes: [], getInterface: () => new EventEmitter() }
    }
    return {
      nodes: [],
      getInterface: (iface: string) => {
        if (iface !== PROPERTIES_IFACE) return {}
        const proxy = new EventEmitter()
        this.proxies.set(path, [...(this.proxies.get(path) ?? []), proxy])
        return proxy
      }
    }
  }

  subscriptions(mac: string) {
    let count = 0
    for (const proxy of this.proxies.get(pathOf(mac)) ?? []) {
      count += proxy.listenerCount('PropertiesChanged')
    }
    return count
  }
}

type Requirer = (this: unknown, id: string, ...rest: unknown[]) => unknown
const patchable = Module as unknown as { prototype: { require: Requirer } }
const realRequire: Requirer = patchable.prototype.require

type DeviceCtor = new (dbus: FakeBus, adapter: string, device: string) => object
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Device = require('@naugehyde/node-ble/src/Device') as DeviceCtor

const settle = async () => {
  for (let i = 0; i < SETTLE_TURNS; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

const startProvider = async () => {
  const bus = new FakeBus()
  const listed = new Set<string>()
  let lookupGate: Promise<void> | undefined
  const adapter = {
    isPowered: async () => true,
    devices: async () => [...listed],
    helper: { callMethod: async () => undefined },
    // A fresh Device per lookup, as node-ble's Adapter.waitDevice() returns
    waitDevice: async (mac: string) => {
      await lookupGate
      return new Device(bus, ADAPTER, nodeOf(mac))
    }
  }
  const provider = new LocalBLEProvider(ADAPTER, MAX_SLOTS)
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
    // node-ble is required synchronously at the start of init()
    ready = provider.init()
  } finally {
    patchable.prototype.require = realRequire
  }
  await ready
  // Holds device lookups until the returned release is called
  const holdLookups = () => {
    let release: () => void = () => undefined
    lookupGate = new Promise<void>((resolve) => {
      release = resolve
    })
    return release
  }
  return { provider, bus, listed, holdLookups }
}

const nextWatch = async () => {
  mock.timers.tick(DEVICE_WATCH_INTERVAL_MS)
  await settle()
}

describe('Local BLE provider device subscriptions', () => {
  let provider: LocalBLEProvider | undefined

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval'] })
  })

  afterEach(() => {
    mock.timers.reset()
    provider?.shutdown()
    provider = undefined
  })

  it('drops the subscription of a device BlueZ no longer lists', async () => {
    const started = await startProvider()
    provider = started.provider
    started.listed.add(PHONE).add(SENSOR)
    await provider.startDiscovery()
    await settle()
    expect(started.bus.subscriptions(PHONE)).to.equal(1)

    started.listed.delete(PHONE)
    await nextWatch()

    expect(started.bus.subscriptions(PHONE)).to.equal(0)
    expect(started.bus.subscriptions(SENSOR)).to.equal(1)
  })

  it('subscribes a device again once BlueZ lists it again', async () => {
    const started = await startProvider()
    provider = started.provider
    started.listed.add(PHONE)
    await provider.startDiscovery()
    await settle()

    started.listed.delete(PHONE)
    await nextWatch()
    started.listed.add(PHONE)
    await nextWatch()

    expect(started.bus.subscriptions(PHONE)).to.equal(1)
  })

  it('leaves no subscription for a device dropped while it is set up', async () => {
    const started = await startProvider()
    provider = started.provider
    const release = started.holdLookups()
    started.listed.add(PHONE)
    await provider.startDiscovery()
    await settle()

    started.listed.delete(PHONE)
    await nextWatch()
    release()
    await settle()

    expect(started.bus.subscriptions(PHONE)).to.equal(0)
  })

  it('releases every subscription when discovery stops', async () => {
    const started = await startProvider()
    provider = started.provider
    started.listed.add(PHONE).add(SENSOR)
    await provider.startDiscovery()
    await settle()

    await provider.stopDiscovery()

    expect(started.bus.subscriptions(PHONE)).to.equal(0)
    expect(started.bus.subscriptions(SENSOR)).to.equal(0)
  })
})
