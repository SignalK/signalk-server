/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Safe wrapper around `@naugehyde/node-ble`'s `createBluetooth()`.
 *
 * `createBluetooth()` opens a D-Bus system-bus connection eagerly and returns
 * synchronously, without attaching an `error` listener to it. The underlying
 * `@jellybrick/dbus-next` connection reports transport failures by emitting
 * `error` on that connection rather than by rejecting the pending call, so a
 * missing or unreachable `/var/run/dbus/system_bus_socket` surfaces as an
 * `error` event with no listener — which Node escalates into an uncaught
 * exception. Because it arrives on the event emitter and not through the
 * promise chain, an `await createBluetooth()...` inside `try/catch` never sees
 * it: the process dies with `connect ENOENT /var/run/dbus/system_bus_socket`
 * a few seconds after the server has otherwise started cleanly.
 *
 * This happens on any host without a reachable system bus — most commonly a
 * container that does not bind-mount the socket, but also a stripped-down
 * Linux install with no D-Bus daemon running.
 *
 * Attaching a listener before handing the session back keeps the failure on
 * the promise path, where the existing `try/catch` blocks already handle it.
 */

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:ble:safe')

export interface BluetoothSession {
  bluetooth: any
  destroy: () => void
}

/**
 * The only part of the dbus-next connection this module touches. node-ble
 * ships no types, so the surface is declared here rather than pulling in an
 * `any` and losing the check on the call below.
 */
interface ErrorEmitter {
  on(event: 'error', listener: (err: unknown) => void): void
}

/**
 * Creates a node-ble session whose D-Bus connection can never raise an
 * unhandled `error` event.
 *
 * The listener is attached synchronously, before the caller gets a chance to
 * await anything, so there is no window in which an early transport error can
 * escape. Errors are logged to debug only: every caller already treats "no
 * usable adapter" as a normal outcome, and a missing system bus is the
 * expected case on non-BlueZ hosts rather than something worth logging loudly.
 */
export function createBluetoothSafe(): BluetoothSession {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createBluetooth } = require('@naugehyde/node-ble')
  const session: BluetoothSession = createBluetooth()

  // node-ble keeps the dbus-next connection on the Bluetooth instance; guard
  // the lookup so an upstream rename degrades to today's behaviour rather
  // than throwing from inside the safety wrapper itself.
  const bus = (session.bluetooth as { dbus?: ErrorEmitter } | undefined)?.dbus
  if (bus && typeof bus.on === 'function') {
    bus.on('error', (err: unknown) => {
      debug(
        `D-Bus system bus error: ${err instanceof Error ? err.message : String(err)}`
      )
    })
  } else {
    debug('Could not attach D-Bus error listener — node-ble internals changed')
  }

  return session
}
