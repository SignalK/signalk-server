/**
 * Signal K QuickJS Plugin Example
 * 
 * This is a simple "Hello World" plugin that demonstrates running
 * JavaScript plugins in a sandboxed QuickJS WASM environment.
 * 
 * The plugin runs completely isolated from the main Node.js process
 * with controlled access to Signal K APIs through the signalk global object.
 */

// Plugin definition object
const plugin = {
  /**
   * Plugin name displayed in the Admin UI
   */
  name: 'QuickJS Hello World',

  /**
   * Plugin ID (automatically derived from package name)
   */
  id: '@signalk/quickjs-hello-world',

  /**
   * Configuration schema for the Admin UI
   * Uses JSON Schema format
   */
  schema: {
    type: 'object',
    required: ['message', 'interval'],
    properties: {
      message: {
        type: 'string',
        title: 'Message',
        description: 'Message to log periodically',
        default: 'Hello from QuickJS!'
      },
      interval: {
        type: 'number',
        title: 'Interval (seconds)',
        description: 'How often to log the message',
        default: 10,
        minimum: 1
      }
    }
  },

  /**
   * Plugin state
   */
  state: {
    intervalId: null,
    config: null
  },

  /**
   * Called when the plugin is started
   * @param {string} configJson - JSON string with configuration
   * @returns {number} - 0 for success, non-zero for error
   */
  start: function(configJson) {
    try {
      // Parse configuration
      this.state.config = JSON.parse(configJson)
      
      // Log startup message
      signalk.debug('Plugin starting with config: ' + configJson)
      signalk.setStatus('Running')

      // Set up periodic message logging
      const self = this
      const intervalMs = (this.state.config.interval || 10) * 1000
      
      // Note: QuickJS doesn't have setInterval, so we'll emit the message once
      // In a real plugin, you might emit data on specific events or from polling
      const message = this.state.config.message || 'Hello from QuickJS!'
      signalk.debug(message)

      // Emit a sample delta
      const delta = JSON.stringify({
        updates: [{
          source: {
            label: 'quickjs-hello-world'
          },
          timestamp: new Date().toISOString(),
          values: [{
            path: 'environment.greeting',
            value: message
          }]
        }]
      })
      
      signalk.emit(delta)
      signalk.debug('Emitted greeting delta')

      return 0 // Success
      
    } catch (error) {
      signalk.setError('Failed to start: ' + error.toString())
      return 1 // Error
    }
  },

  /**
   * Called when the plugin is stopped
   * @returns {number} - 0 for success, non-zero for error
   */
  stop: function() {
    try {
      signalk.debug('Plugin stopping')
      signalk.setStatus('Stopped')
      return 0 // Success
    } catch (error) {
      signalk.setError('Failed to stop: ' + error.toString())
      return 1 // Error
    }
  },

  /**
   * Example: Get vessel position
   */
  getPosition: function() {
    const positionJson = signalk.getSelfPath('navigation.position')
    if (positionJson) {
      const position = JSON.parse(positionJson)
      signalk.debug('Current position: ' + JSON.stringify(position))
      return position
    }
    return null
  }
}

// The plugin object must be available in global scope
// for the QuickJS plugin loader to access it
