import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import Module from 'node:module'
import { LocalBLEProvider } from '../src/api/ble/localProvider'

/**
 * A GATT connection made through the local provider must learn that its link
 * is gone, whether BlueZ lost it or bluetoothd itself went away. Without that a
 * plugin keeps writing over a dead link, never reconnects, and the connection
 * slot stays taken.
 *
 * The provider is driven through the real node-ble Device/GattServer classes
 * on top of a fake D-Bus: whether 'disconnect' is delivered depends on how
 * the provider and node-ble interact, which a hand-written Device double
 * would simply assume.
 */

const MAC = 'AA:BB:CC:DD:EE:FF'
const ADAPTER = 'hci0'
const DEVICE_NODE = 'dev_AA_BB_CC_DD_EE_FF'
const DEVICE_PATH = `/org/bluez/${ADAPTER}/${DEVICE_NODE}`
const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'
const NOTIFY_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'
const MAX_SLOTS = 3
// Covers the provider's first reconnect backoff
const RECONNECT_TEST_TIMEOUT_MS = 15000
// Covers the provider's device-watch interval, which also resumes discovery
const RESUME_TEST_TIMEOUT_MS = 15000
const RESUME_POLL_MS = 100
// Two device-watch ticks, and well inside the test's timeout
const RESUME_DEADLINE_MS = 11000
// Long enough for one device-watch tick to have run
const WATCH_TICK_MS = 5500
// Polling for the provider's cleanup disconnect, ending before the timeout
const CLEANUP_POLL_MS = 100
const CLEANUP_MARGIN_MS = 3000
// A setup that waits on a dead link would otherwise run into mocha's default
const SETUP_TEST_TIMEOUT_MS = 5000
// A deadline for connectGATT() setup steps, well inside the above, for the
// tests that run into it
const SETUP_DEADLINE_MS = 300

const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties'
const DEVICE_IFACE = 'org.bluez.Device1'
const BUS_DAEMON = 'org.freedesktop.DBus'

type Props = Record<string, unknown>

const OBJECTS: Record<string, Record<string, Props>> = {
  [DEVICE_PATH]: { [DEVICE_IFACE]: { ServicesResolved: true } },
  [`${DEVICE_PATH}/service0001`]: {
    'org.bluez.GattService1': { UUID: SERVICE_UUID }
  },
  [`${DEVICE_PATH}/service0001/char0002`]: {
    'org.bluez.GattCharacteristic1': { UUID: NOTIFY_UUID }
  }
}

// Every proxy gets its own Properties endpoint, as with dbus-next, so that one
// proxy dropping its listeners leaves the other subscribers of that path alone.
class FakeBus extends EventEmitter {
  disconnectCalls = 0
  servicesResolved = true
  // Leaves Disconnect calls unanswered, as a wedged bluetoothd would
  hangDisconnect = false
  // Lets a test lose the link at a chosen point of the connection setup
  onServicesResolvedRead?: () => void
  onStartNotify?: () => void
  private readonly busDaemon = new EventEmitter()
  private readonly subscribers = new Map<string, Set<EventEmitter>>()
  private connectGate?: Promise<void>
  private connectStarted?: () => void
  private servicesResolvedGate?: Promise<void>

  async getProxyObject(service: string, path: string) {
    if (service === BUS_DAEMON) {
      return { nodes: [], getInterface: () => this.busDaemon }
    }
    return {
      nodes: Object.keys(OBJECTS).filter((p) => p.startsWith(`${path}/`)),
      getInterface: (iface: string) =>
        iface === PROPERTIES_IFACE
          ? this.propertiesProxy(path)
          : {
              Connect: async () => {
                this.connectStarted?.()
                await this.connectGate
              },
              // As BlueZ does, signals the change before replying to the call
              Disconnect: async () => {
                this.disconnectCalls++
                if (this.hangDisconnect) return new Promise<void>(() => {})
                this.loseLink()
              },
              StartNotify: async () => {
                this.onStartNotify?.()
              }
            }
    }
  }

  // Keeps Connect calls pending until release(), so a test can act while the
  // link is still coming up; `connecting` resolves once a call is in flight.
  holdConnect() {
    let release: () => void = () => undefined
    this.connectGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const connecting = new Promise<void>((resolve) => {
      this.connectStarted = resolve
    })
    return { connecting, release }
  }

  holdServicesResolvedRead() {
    let release: () => void = () => undefined
    this.servicesResolvedGate = new Promise<void>((resolve) => {
      release = resolve
    })
    return release
  }

  // Lets later Connect calls through while an earlier held one stays pending
  stopHoldingConnect() {
    this.connectGate = undefined
  }

  private propertiesProxy(path: string) {
    const proxy = Object.assign(new EventEmitter(), {
      Get: async (iface: string, name: string) => {
        if (name === 'ServicesResolved') {
          this.onServicesResolvedRead?.()
          await this.servicesResolvedGate
          return { value: this.servicesResolved }
        }
        return { value: OBJECTS[path]?.[iface]?.[name] }
      }
    })
    const forPath = this.subscribers.get(path) ?? new Set<EventEmitter>()
    forPath.add(proxy)
    this.subscribers.set(path, forPath)
    return proxy
  }

  // The two ownership changes the bus daemon reports for a restart
  restartBluetoothd() {
    this.busDaemon.emit('NameOwnerChanged', 'org.bluez', ':1.10', '')
    this.busDaemon.emit('NameOwnerChanged', 'org.bluez', '', ':1.11')
  }

  // PropertiesChanged listeners still subscribed to the device
  deviceListeners() {
    let count = 0
    for (const proxy of this.subscribers.get(DEVICE_PATH) ?? []) {
      count += proxy.listenerCount('PropertiesChanged')
    }
    return count
  }

  loseLink() {
    for (const proxy of this.subscribers.get(DEVICE_PATH) ?? []) {
      proxy.emit(
        'PropertiesChanged',
        DEVICE_IFACE,
        { Connected: { value: false } },
        []
      )
    }
  }
}

// Module.prototype.require is not in @types/node's public surface, so the
// patch point is described structurally rather than reached through `any`.
type Requirer = (this: unknown, id: string, ...rest: unknown[]) => unknown
const patchable = Module as unknown as { prototype: { require: Requirer } }
const realRequire: Requirer = patchable.prototype.require

type DeviceCtor = new (dbus: FakeBus, adapter: string, device: string) => object
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Device = require('@naugehyde/node-ble/src/Device') as DeviceCtor

const startProvider = async (setupDeadlineMs?: number) => {
  const bus = new FakeBus()
  const adapterCalls: string[] = []
  const adapter = {
    isPowered: async () => true,
    devices: async () => [],
    helper: {
      callMethod: async (method: string) => {
        adapterCalls.push(method)
      }
    },
    // A fresh Device per lookup, as node-ble's Adapter.waitDevice() returns
    waitDevice: async () => new Device(bus, ADAPTER, DEVICE_NODE)
  }
  const provider = new LocalBLEProvider(
    ADAPTER,
    MAX_SLOTS,
    undefined,
    setupDeadlineMs
  )

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

  return { provider, bus, adapterCalls }
}

describe('Local BLE provider GATT link loss', () => {
  let provider: LocalBLEProvider | undefined

  afterEach(() => {
    provider?.shutdown()
    provider = undefined
  })

  it('tells a connectGATT() connection and frees its slot', async () => {
    const started = await startProvider()
    provider = started.provider
    const conn = await provider.connectGATT(MAC)
    let disconnects = 0
    conn.onDisconnect(() => disconnects++)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS - 1)

    started.bus.loseLink()

    expect(conn.connected).to.equal(false)
    expect(disconnects).to.equal(1)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('does not report an intended connectGATT() disconnect as a lost link', async () => {
    const started = await startProvider()
    provider = started.provider
    const conn = await provider.connectGATT(MAC)
    let disconnects = 0
    conn.onDisconnect(() => disconnects++)

    await conn.disconnect()

    expect(conn.connected).to.equal(false)
    expect(disconnects).to.equal(0)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('reports a link loss only to the connection that had the link', async () => {
    const started = await startProvider()
    provider = started.provider
    const first = await provider.connectGATT(MAC)
    let firstDisconnects = 0
    first.onDisconnect(() => firstDisconnects++)
    started.bus.loseLink()

    const second = await provider.connectGATT(MAC)
    let secondDisconnects = 0
    second.onDisconnect(() => secondDisconnects++)
    started.bus.loseLink()

    expect(firstDisconnects).to.equal(1)
    expect(secondDisconnects).to.equal(1)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('reconnects a subscribeGATT() session and reports each loss once', async function () {
    this.timeout(RECONNECT_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    const handle = await provider.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID },
      () => undefined
    )
    let disconnects = 0
    handle.onDisconnect(() => disconnects++)
    const reconnected = new Promise<void>((resolve) =>
      handle.onConnect(resolve)
    )

    started.bus.loseLink()
    expect(handle.connected).to.equal(false)
    expect(disconnects).to.equal(1)

    await reconnected
    expect(handle.connected).to.equal(true)

    started.bus.loseLink()
    expect(disconnects).to.equal(2)

    await handle.close()
  })

  it('does not report its own cleanup after a failed reconnect as a link loss', async function () {
    this.timeout(RECONNECT_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    const { bus } = started
    const handle = await provider.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID, notify: [NOTIFY_UUID] },
      () => undefined
    )
    let disconnects = 0
    handle.onDisconnect(() => disconnects++)
    bus.loseLink()
    expect(disconnects).to.equal(1)

    // The reconnect gets its link, then fails setup with that link still up,
    // so the provider disconnects it itself
    bus.onStartNotify = () => {
      throw new Error('ATT error 0x0e')
    }
    const deadline = Date.now() + RECONNECT_TEST_TIMEOUT_MS - CLEANUP_MARGIN_MS
    while (bus.disconnectCalls < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CLEANUP_POLL_MS))
    }

    expect(bus.disconnectCalls).to.equal(1)
    expect(disconnects).to.equal(1)

    await handle.close()
  })

  it('disconnects a link that comes up after its session was closed', async () => {
    const started = await startProvider()
    provider = started.provider
    const { connecting, release } = started.bus.holdConnect()
    const subscribed = provider.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID },
      () => undefined
    )
    await connecting

    provider.shutdown()
    release()
    await subscribed

    expect(started.bus.disconnectCalls).to.equal(1)
  })

  it('fails a connectGATT() whose link goes before services resolve', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    const { bus } = started
    bus.servicesResolved = false
    bus.onServicesResolvedRead = () => setImmediate(() => bus.loseLink())

    const error = await provider.connectGATT(MAC).then(
      () => undefined,
      (e: Error) => e
    )

    expect(error?.message).to.match(/lost/)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('gives up on a connectGATT() whose Connect call BlueZ never answers', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider(SETUP_DEADLINE_MS)
    provider = started.provider
    const { bus } = started
    bus.holdConnect()

    const error = await provider.connectGATT(MAC).then(
      () => undefined,
      (e: Error) => e
    )

    expect(error?.message).to.match(/connecting to .* timed out/)
    // Disconnect is what makes BlueZ abandon the pending Connect
    expect(bus.disconnectCalls).to.equal(1)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)

    // The connect queue is free again for the next caller
    bus.stopHoldingConnect()
    const conn = await provider.connectGATT(MAC)
    expect(conn.connected).to.equal(true)
    await conn.disconnect()
  })

  it('gives up on a connectGATT() whose services never resolve on a live link', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider(SETUP_DEADLINE_MS)
    provider = started.provider
    const { bus } = started
    bus.servicesResolved = false

    const error = await provider.connectGATT(MAC).then(
      () => undefined,
      (e: Error) => e
    )

    expect(error?.message).to.match(/resolving services of .* timed out/)
    expect(bus.disconnectCalls).to.equal(1)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
    expect(bus.deviceListeners()).to.equal(0)
  })

  it('does not start waiting for ServicesResolved once connectGATT() has given up', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider(SETUP_DEADLINE_MS)
    provider = started.provider
    const { bus } = started
    bus.servicesResolved = false
    const releaseRead = bus.holdServicesResolvedRead()

    const error = await provider.connectGATT(MAC).then(
      () => undefined,
      (e: Error) => e
    )
    expect(error?.message).to.match(/resolving services of .* timed out/)

    // The read answers only after the deadline, and says to wait
    releaseRead()
    await new Promise((resolve) => setImmediate(resolve))

    expect(bus.deviceListeners()).to.equal(0)
  })

  it('does not wait forever on the Disconnect that abandons a hung Connect', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider(SETUP_DEADLINE_MS)
    provider = started.provider
    const { bus } = started
    bus.holdConnect()
    bus.hangDisconnect = true

    const error = await provider.connectGATT(MAC).then(
      () => undefined,
      (e: Error) => e
    )

    expect(error?.message).to.match(/connecting to .* timed out/)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
    expect(bus.deviceListeners()).to.equal(0)

    // The connect queue is free again for the next caller
    bus.stopHoldingConnect()
    bus.hangDisconnect = false
    const conn = await provider.connectGATT(MAC)
    expect(conn.connected).to.equal(true)
    await conn.disconnect()
  })

  it('fails a subscribeGATT() whose link goes before services resolve', async function () {
    this.timeout(SETUP_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    const { bus } = started
    bus.servicesResolved = false
    bus.onServicesResolvedRead = () => setImmediate(() => bus.loseLink())

    const error = await provider
      .subscribeGATT({ mac: MAC, service: SERVICE_UUID }, () => undefined)
      .then(
        () => undefined,
        (e: Error) => e
      )

    expect(error?.message).to.match(/lost/)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('fails a subscribeGATT() whose link goes during a setup step BlueZ still answers', async () => {
    const started = await startProvider()
    provider = started.provider
    const { bus } = started
    bus.onStartNotify = () => bus.loseLink()

    const error = await provider
      .subscribeGATT(
        { mac: MAC, service: SERVICE_UUID, notify: [NOTIFY_UUID] },
        () => undefined
      )
      .then(
        () => undefined,
        (e: Error) => e
      )

    expect(error?.message).to.match(/lost during setup/)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('tells a connectGATT() connection when bluetoothd restarts', async () => {
    const started = await startProvider()
    provider = started.provider
    const conn = await provider.connectGATT(MAC)
    let disconnects = 0
    conn.onDisconnect(() => disconnects++)

    started.bus.restartBluetoothd()

    expect(conn.connected).to.equal(false)
    expect(disconnects).to.equal(1)
    expect(provider.availableGATTSlots()).to.equal(MAX_SLOTS)
  })

  it('tells a subscribeGATT() session when bluetoothd restarts, and reconnects it', async function () {
    this.timeout(RECONNECT_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    const handle = await provider.subscribeGATT(
      { mac: MAC, service: SERVICE_UUID },
      () => undefined
    )
    let disconnects = 0
    handle.onDisconnect(() => disconnects++)
    const reconnected = new Promise<void>((resolve) =>
      handle.onConnect(resolve)
    )

    started.bus.restartBluetoothd()

    expect(handle.connected).to.equal(false)
    expect(disconnects).to.equal(1)

    await reconnected
    expect(handle.connected).to.equal(true)

    await handle.close()
  })

  it('leaves a connection closed before a bluetoothd restart alone', async () => {
    const started = await startProvider()
    provider = started.provider
    const conn = await provider.connectGATT(MAC)
    let disconnects = 0
    conn.onDisconnect(() => disconnects++)
    await conn.disconnect()

    started.bus.restartBluetoothd()

    expect(disconnects).to.equal(0)
  })
})

describe('Local BLE provider discovery', () => {
  let provider: LocalBLEProvider | undefined

  afterEach(() => {
    provider?.shutdown()
    provider = undefined
  })

  it('is asked of the new bluetoothd again after a restart', async function () {
    this.timeout(RESUME_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    await provider.startDiscovery()
    const discoveryStarts = () =>
      started.adapterCalls.filter((m) => m === 'StartDiscovery').length
    expect(discoveryStarts()).to.equal(1)

    started.bus.restartBluetoothd()

    // Ends the polling itself: mocha failing the test on its timeout would
    // leave the loop running for the rest of the run
    const deadline = Date.now() + RESUME_DEADLINE_MS
    while (discoveryStarts() < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RESUME_POLL_MS))
    }
    expect(discoveryStarts()).to.equal(2)
  })

  it('is not asked for twice when stopped and started around a restart', async function () {
    this.timeout(RESUME_TEST_TIMEOUT_MS)
    const started = await startProvider()
    provider = started.provider
    await provider.startDiscovery()
    started.bus.restartBluetoothd()
    await provider.stopDiscovery()
    await provider.startDiscovery()

    await new Promise((resolve) => setTimeout(resolve, WATCH_TICK_MS))

    expect(
      started.adapterCalls.filter((m) => m === 'StartDiscovery')
    ).to.have.length(2)
  })
})
