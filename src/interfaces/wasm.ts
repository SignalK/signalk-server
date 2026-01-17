/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Interface
 *
 * Manages the WASM runtime as a Signal K interface.
 * Can be enabled/disabled via settings.interfaces.wasm
 */

import Debug from 'debug'
import { initializeWasm, shutdownAllWasmPlugins } from '../wasm'

const debug = Debug('signalk:interfaces:wasm')

module.exports = (app: any) => {
  const api: any = {}

  api.start = () => {
    debug('Starting WASM interface')
    try {
      const { wasmRuntime, wasmSubscriptionManager } = initializeWasm()
      app.wasmRuntime = wasmRuntime
      app.wasmSubscriptionManager = wasmSubscriptionManager
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
      shutdownAllWasmPlugins()
    } catch (error) {
      debug('WASM shutdown error:', error)
    }
  }

  return api
}
