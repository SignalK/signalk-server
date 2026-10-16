/**
 * Teardown callbacks for what a WASM plugin registers with the server through
 * host bindings while it runs (PUT handlers, resource, weather and radar
 * providers). Like the onStopHandlers of Node plugins, they run once when the
 * plugin stops, so the server never calls into a stopped instance and the
 * next start registers afresh.
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:stop-handlers')

const stopHandlers: Map<string, Array<() => void>> = new Map()

/**
 * Record a teardown to run when the plugin with this binding id stops.
 * Handlers accumulate per plugin until `runStopHandlers` consumes them.
 */
export function addStopHandler(pluginId: string, handler: () => void): void {
  const handlers = stopHandlers.get(pluginId)
  if (handlers) {
    handlers.push(handler)
  } else {
    stopHandlers.set(pluginId, [handler])
  }
}

/**
 * Run and forget every teardown recorded for the plugin, in registration
 * order. A throwing handler is logged and does not prevent the rest from
 * running, so one faulty registration cannot leave others behind.
 */
export function runStopHandlers(pluginId: string): void {
  const handlers = stopHandlers.get(pluginId)
  if (!handlers) {
    return
  }
  stopHandlers.delete(pluginId)
  for (const handler of handlers) {
    try {
      handler()
    } catch (error) {
      debug(`[${pluginId}] stop handler error: ${error}`)
    }
  }
}
