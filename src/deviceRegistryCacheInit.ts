/*
 * Device Registry Cache Initialization
 * Initializes and maintains the device registry cache with security config updates
 */

import { deviceRegistryCache, Device } from './deviceRegistryCache'
import { WithSecurityStrategy } from './security'
import { createDebug } from './debug'
import { EventEmitter } from 'events'

const debug = createDebug('signalk-server:device-registry-cache-init')

interface AppWithEvents extends WithSecurityStrategy, EventEmitter {
  securityStrategy: WithSecurityStrategy['securityStrategy'] & {
    getDevices?: (config: Record<string, unknown>) => Device[]
    getConfiguration?: () => Record<string, unknown>
  }
}

/**
 * Initializes the device registry cache and sets up event listeners for real-time updates.
 * 
 * This function performs the following tasks:
 * 1. Loads all existing devices from the security configuration into the cache
 * 2. Sets up event listeners for security configuration changes to reload all devices
 * 3. Sets up event listeners for individual device operations (add/update/remove) for real-time updates
 * 
 * The cache is used by the delta statistics module to resolve WebSocket client IDs to user-friendly
 * device names that are displayed in the Dashboard. This provides a better user experience by showing
 * descriptive names instead of cryptic WebSocket IDs.
 * 
 * @param app - The SignalK server application instance with security strategy and event emitter capabilities
 * 
 * @example
 * // Called during server initialization after security is set up
 * initializeDeviceRegistryCache(app)
 * 
 * @remarks
 * - Requires the security strategy to be initialized before calling
 * - Gracefully handles cases where security is not enabled or devices are not supported
 * - All errors are caught and logged to prevent server startup failures
 */
export function initializeDeviceRegistryCache(app: AppWithEvents) {
  debug('Initializing device registry cache')

  // Initial load of devices
  loadDevices(app)

  // Listen for security configuration changes
  if (app.on) {
    app.on('securityConfigChange', () => {
      debug('Security config changed, updating device registry cache')
      loadDevices(app)
    })
  }

  // Also listen for specific device updates if available
  if (app.on) {
    app.on('deviceAdded', (device: Device) => {
      debug('Device added:', device.clientId)
      deviceRegistryCache.setDevice(device)
    })

    app.on('deviceUpdated', (device: Device) => {
      debug('Device updated:', device.clientId)
      deviceRegistryCache.setDevice(device)
    })

    app.on('deviceRemoved', (clientId: string) => {
      debug('Device removed:', clientId)
      deviceRegistryCache.removeDevice(clientId)
    })
  }
}

function loadDevices(app: AppWithEvents) {
  try {
    if (
      app.securityStrategy &&
      typeof app.securityStrategy.getDevices === 'function'
    ) {
      // Get the current configuration
      const config = app.securityStrategy.getConfiguration
        ? app.securityStrategy.getConfiguration()
        : {}

      const devices = app.securityStrategy.getDevices(config)
      debug(`Loading ${devices.length} devices into cache`)
      deviceRegistryCache.initialize(devices)
    } else {
      debug('Security strategy does not support getDevices')
    }
  } catch (error) {
    console.error('Error loading devices into cache:', error)
  }
}
