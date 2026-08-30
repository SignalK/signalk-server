import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import Module from 'node:module'

/**
 * Regression tests for the BLE local provider taking the whole server down.
 * See `src/api/ble/safeBluetooth.ts` for the failure this guards against.
 */

// Stand-in for the dbus-next connection: an emitter whose only interesting
// behaviour is that an unlistened 'error' throws, exactly as Node's does.
class FakeBus extends EventEmitter {}

// The wrapper returns its own bluetooth facade, so the stub records the bus
// it handed out for the test to drive.
let lastBus: FakeBus | undefined

// Module.prototype.require is not in @types/node's public surface, so the
// patch point is described structurally rather than reached through `any`.
type Requirer = (this: unknown, id: string, ...rest: unknown[]) => unknown
interface PatchableModule {
  prototype: { require: Requirer }
}

const patchable = Module as unknown as PatchableModule
const requireStub: Requirer = patchable.prototype.require

// Returns whatever the callback returns, and hands back the bus the stub
// created so tests never read a stale one from an earlier case.
const withStubbedNodeBle = <T>(fn: () => T): { result: T; bus: FakeBus } => {
  lastBus = undefined
  patchable.prototype.require = function (
    this: unknown,
    id: string,
    ...rest: unknown[]
  ) {
    if (id === '@naugehyde/node-ble') {
      return {
        createBluetooth: () => {
          const dbus = new FakeBus()
          lastBus = dbus
          return {
            bluetooth: {
              dbus,
              // Never settles on its own — mirrors dbus-next leaving calls
              // in flight when the connection dies.
              activeAdapters: () => new Promise(() => undefined),
              getAdapter: () => Promise.resolve({})
            },
            destroy: () => undefined
          }
        }
      }
    }
    return requireStub.call(this, id, ...rest)
  }
  let result: T
  try {
    result = fn()
  } finally {
    patchable.prototype.require = requireStub
  }
  if (!lastBus) {
    throw new Error('stub was never invoked — createBluetooth() not called')
  }
  return { result, bus: lastBus }
}

describe('BLE D-Bus transport errors', () => {
  it('does not let a system-bus error escape as an uncaught exception', () => {
    const { bus } = withStubbedNodeBle(() => {
      // Imported inside the stub so the wrapper picks up the fake module.
      const { createBluetoothSafe } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')

      return createBluetoothSafe()
    })

    expect(bus.listenerCount('error')).to.equal(
      1,
      'expected an error listener to be attached synchronously'
    )

    // The real failure: ENOENT on the system bus socket.
    const emit = () =>
      bus.emit(
        'error',
        Object.assign(
          new Error('connect ENOENT /var/run/dbus/system_bus_socket'),
          {
            code: 'ENOENT'
          }
        )
      )

    expect(emit).to.not.throw()
  })

  it('rejects a pending adapter call when the bus fails under it', async () => {
    const { result: session, bus } = withStubbedNodeBle(() => {
      const { createBluetoothSafe: make } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')
      return make()
    })

    const baseline = bus.listenerCount('error')

    // A call that never settles on its own, as the real one does not.
    const pending = session.bluetooth.activeAdapters()

    bus.emit(
      'error',
      new Error('connect ENOENT /var/run/dbus/system_bus_socket')
    )

    let rejected = false
    await pending.catch(() => {
      rejected = true
    })
    expect(rejected).to.equal(
      true,
      'expected the pending call to reject once the bus failed'
    )

    expect(bus.listenerCount('error')).to.equal(
      baseline,
      'expected the per-call listener to be removed on the bus-error path'
    )
  })

  it('does not accumulate bus listeners across calls', async () => {
    const { result: session, bus } = withStubbedNodeBle(() => {
      const { createBluetoothSafe: make } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')
      return make()
    })

    const before = bus.listenerCount('error')
    for (let i = 0; i < 12; i++) {
      await session.bluetooth.getAdapter('hci0')
    }
    expect(bus.listenerCount('error')).to.equal(
      before,
      'expected per-call listeners to be removed once the call settled'
    )
  })

  it('still returns a usable session when the bus is healthy', () => {
    withStubbedNodeBle(() => {
      const { createBluetoothSafe } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')

      const session = createBluetoothSafe()
      expect(session.bluetooth).to.be.an('object')
      expect(session.destroy).to.be.a('function')
    })
  })
})
