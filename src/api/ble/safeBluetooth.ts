/**
 * Safe wrapper around `@naugehyde/node-ble`'s `createBluetooth()`.
 *
 * `createBluetooth()` opens a D-Bus system-bus connection eagerly and returns
 * synchronously, without attaching an `error` listener to it. The underlying
 * `@jellybrick/dbus-next` connection reports transport failures by emitting
 * `error` on that connection rather than by rejecting the pending call, so a
 * missing or unreachable `/var/run/dbus/system_bus_socket` — a container that
 * does not bind-mount it, or a host with no D-Bus daemon — surfaces as an
 * `error` event with no listener, which Node escalates into an uncaught
 * exception. Arriving on the emitter and not the promise chain, it slips past
 * the `try/catch` around the awaited call and kills the process seconds after
 * the server has otherwise started cleanly.
 *
 * Swallowing that event alone would trade the crash for a hang: dbus-next
 * leaves in-flight calls unsettled when the connection dies, so an operation
 * issued before the failure would never return. So the listener goes on
 * synchronously — before the caller can await anything, leaving no window for
 * an early error to escape — and the recorded failure is replayed as a
 * rejection from every method this codebase calls. Callers already treat "no
 * usable adapter" as a normal outcome, so it lands in error handling that
 * exists.
 */

import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:ble:safe')

/**
 * The parts of node-ble's Bluetooth object this codebase actually uses.
 * node-ble's shipped declarations are incomplete relative to its runtime —
 * they expose neither `activeAdapters()` (already used here) nor `dbus` — so
 * the surface is described locally instead.
 */
export interface SafeBluetooth {
  activeAdapters(): Promise<Array<{ adapter: string }>>
  getAdapter(adapter: string): Promise<unknown>
}

export interface BluetoothSession {
  bluetooth: SafeBluetooth
  destroy: () => void
}

/** The only part of the dbus-next connection this module touches. */
interface ErrorEmitter {
  on(event: 'error', listener: (err: unknown) => void): void
  off(event: 'error', listener: (err: unknown) => void): void
}

export function createBluetoothSafe(): BluetoothSession {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createBluetooth } = require('@naugehyde/node-ble')
  const session = createBluetooth() as {
    bluetooth: SafeBluetooth
    destroy: () => void
  }

  // Set once the bus reports a transport failure. Every later call fails
  // fast with this rather than waiting on a connection that is gone.
  let busError: Error | undefined

  // node-ble keeps the dbus-next connection on the Bluetooth instance; guard
  // the lookup so an upstream rename degrades to today's behaviour rather
  // than throwing from inside the safety wrapper itself.
  const maybeBus = (session.bluetooth as unknown as { dbus?: ErrorEmitter })
    ?.dbus
  const canListen =
    !!maybeBus &&
    typeof maybeBus.on === 'function' &&
    typeof maybeBus.off === 'function'
  const bus = maybeBus as ErrorEmitter
  if (canListen) {
    bus.on('error', (err: unknown) => {
      busError =
        err instanceof Error ? err : new Error(String(err ?? 'unknown error'))
      debug.enabled && debug(`D-Bus system bus error: ${busError.message}`)
    })
  } else {
    debug('Could not attach D-Bus error listener — node-ble internals changed')
  }

  // Races each call against the bus failing under it. Without this an
  // operation already in flight when the socket dies never settles.
  const guard = <T>(op: () => Promise<T>): Promise<T> => {
    if (busError) return Promise.reject(busError)
    if (!canListen) return op()
    return new Promise<T>((resolve, reject) => {
      // Detached on every settle path, including the bus-error one: when the
      // bus fails the underlying operation stays pending forever, so the
      // op().then() handlers below never run and would leave the listener
      // attached. A long-lived session would then trip Node's max-listeners
      // warning after ten failed operations.
      const done = () => bus.off('error', onBusError)
      function onBusError(err: unknown) {
        done()
        reject(
          err instanceof Error ? err : new Error(String(err ?? 'bus error'))
        )
      }
      bus.on('error', onBusError)
      op().then(
        (v) => {
          done()
          resolve(v)
        },
        (e) => {
          done()
          reject(e)
        }
      )
    })
  }

  const bluetooth: SafeBluetooth = {
    activeAdapters: () => guard(() => session.bluetooth.activeAdapters()),
    getAdapter: (adapter: string) =>
      guard(() => session.bluetooth.getAdapter(adapter))
  }

  return { bluetooth, destroy: session.destroy }
}
