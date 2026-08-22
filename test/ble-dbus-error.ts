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
          return { bluetooth: { dbus }, destroy: () => undefined }
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

      const session = createBluetoothSafe()
      const bus = (session.bluetooth as { dbus: FakeBus }).dbus

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
