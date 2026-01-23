/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Interface
 *
 * Manages the WASM runtime as a Signal K interface.
 * Can be enabled/disabled via settings.interfaces.wasm
 */

import Debug from 'debug'
import { initializeWasm, shutdownAllWasmPlugins } from '../wasm'
import { getEventManager, ServerEvent } from '../wasm/wasm-events'

const debug = Debug('signalk:interfaces:wasm')

module.exports = (app: any) => {
  const api: any = {}
  let serverEventListener: ((event: ServerEvent) => void) | null = null

  api.start = () => {
    debug('Starting WASM interface')
    try {
      const { wasmRuntime, wasmSubscriptionManager } = initializeWasm()
      app.wasmRuntime = wasmRuntime
      app.wasmSubscriptionManager = wasmSubscriptionManager

      // Forward server events to WASM event manager
      serverEventListener = (event: ServerEvent) => {
        const eventManager = getEventManager()
        eventManager.routeEvent(event)
      }
      app.on('serverevent', serverEventListener)
      debug('WASM server event forwarding enabled')

      debug('WASM runtime initialized successfully')
      return { enabled: true }
    } catch (error) {
      debug('WASM runtime initialization failed:', error)
      return { enabled: false, error }
    }
  }

  api.stop = () => {
    debug('Stopping WASM interface')
    try {
      // Remove server event listener
      if (serverEventListener) {
        app.removeListener('serverevent', serverEventListener)
        serverEventListener = null
        debug('WASM server event forwarding disabled')
      }
      shutdownAllWasmPlugins()
    } catch (error) {
      debug('WASM shutdown error:', error)
    }
  }

  return api
}
