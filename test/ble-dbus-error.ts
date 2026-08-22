import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import Module from 'node:module'

/**
 * Regression test for the BLE local provider taking the whole server down.
 *
 * `@naugehyde/node-ble`'s `createBluetooth()` opens a D-Bus system-bus
 * connection eagerly and hands it back without an `error` listener. dbus-next
 * reports transport failures by emitting `error` on that connection, so on a
 * host with no reachable `/var/run/dbus/system_bus_socket` (any container that
 * does not mount it) the failure arrives as an unhandled `error` event and
 * Node escalates it to an uncaught exception — several seconds after the
 * server has otherwise started cleanly. The `try/catch` around the awaited
 * calls cannot catch it because it never travels the promise path.
 *
 * `createBluetoothSafe()` attaches the listener synchronously, before the
 * caller can await anything, closing that window.
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

const withStubbedNodeBle = (fn: () => void) => {
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
              getAdapter: () => new Promise(() => undefined)
            },
            destroy: () => undefined
          }
        }
      }
    }
    return requireStub.call(this, id, ...rest)
  }
  try {
    fn()
  } finally {
    patchable.prototype.require = requireStub
  }
}

describe('BLE D-Bus transport errors', () => {
  it('does not let a system-bus error escape as an uncaught exception', () => {
    withStubbedNodeBle(() => {
      // Imported inside the stub so the wrapper picks up the fake module.
      const { createBluetoothSafe } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')

      createBluetoothSafe()
      const bus = lastBus as FakeBus

      expect(bus.listenerCount('error')).to.equal(
        1,
        'expected an error listener to be attached synchronously'
      )

      // The real failure: ENOENT on the system bus socket. Without a
      // listener attached, this emit throws and takes the process down.
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
  })

  it('rejects a pending adapter call when the bus fails under it', async () => {
    // Swallowing the 'error' event is not enough on its own: dbus-next does
    // not settle in-flight calls when the connection dies, so an operation
    // issued before the failure would otherwise stay pending forever and
    // turn the crash into a hang.
    let session!: { bluetooth: { activeAdapters(): Promise<unknown> } }

    withStubbedNodeBle(() => {
      const { createBluetoothSafe: make } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/api/ble/safeBluetooth') as typeof import('../src/api/ble/safeBluetooth')
      session = make()
    })
    const bus = lastBus as FakeBus

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
