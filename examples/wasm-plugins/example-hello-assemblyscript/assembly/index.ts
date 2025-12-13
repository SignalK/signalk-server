/**
 * Hello World - AssemblyScript WASM Plugin
 *
 * Demonstrates basic AssemblyScript plugin structure for Signal K
 */

import {
  Plugin,
  Delta,
  Update,
  PathValue,
  Source,
  Notification,
  NotificationState,
  emit,
  setStatus,
  setError,
  debug,
  getCurrentTimestamp
} from '@signalk/assemblyscript-plugin-sdk/assembly'

/**
 * Plugin configuration interface
 */
class HelloConfig {
  message: string = 'Hello from AssemblyScript!'
  updateInterval: i32 = 5000
  enableDebugLogging: boolean = false
}

/**
 * Hello World Plugin Implementation
 */
class HelloPlugin extends Plugin {
  private config: HelloConfig = new HelloConfig()

  /**
   * Helper to conditionally log debug messages
   */
  private logDebug(message: string): void {
    if (this.config.enableDebugLogging) {
      debug(message)
    }
  }

  /**
   * Plugin name shown in admin UI
   * Note: Plugin ID is derived from package.json name
   */
  name(): string {
    return 'Hello AssemblyScript Plugin'
  }

  /**
   * JSON schema for configuration UI
   */
  schema(): string {
    return `{
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "title": "Welcome Message",
          "default": "Hello from AssemblyScript!"
        },
        "updateInterval": {
          "type": "number",
          "title": "Update Interval (ms)",
          "default": 5000
        }
      }
    }`
  }

  /**
   * Start plugin with configuration
   */
  start(configJson: string): i32 {
    // Parse configuration
    // Note: For production, use a JSON parser like assemblyscript-json
    // For this example, we do basic string parsing

    // Check enableDebug at root level (matches regular plugin config structure)
    if (
      configJson.includes('"enableDebug":true') ||
      configJson.includes('"enableDebug": true')
    ) {
      this.config.enableDebugLogging = true
    }

    this.logDebug('========================================')
    this.logDebug('Hello AssemblyScript plugin starting...')
    this.logDebug(`Plugin ID: ${this.id()}`)
    this.logDebug(`Plugin Name: ${this.name()}`)
    this.logDebug(`Configuration received: ${configJson}`)
    this.logDebug(
      `Debug logging: ${this.config.enableDebugLogging ? 'ENABLED' : 'DISABLED'}`
    )
    this.logDebug('========================================')

    setStatus('Started successfully')
    this.logDebug('Status set to: Started successfully')

    // Emit a welcome notification
    this.logDebug('Emitting welcome notification...')
    this.emitWelcomeNotification()

    // Emit a test delta
    this.logDebug('Emitting test delta with plugin info...')
    this.emitTestDelta()

    this.logDebug('========================================')
    this.logDebug('Hello AssemblyScript plugin started successfully!')
    this.logDebug('========================================')
    return 0 // Success
  }

  /**
   * Stop plugin
   */
  stop(): i32 {
    this.logDebug('========================================')
    this.logDebug('Hello AssemblyScript plugin stopping...')
    this.logDebug(`Plugin ID: ${this.id()}`)
    setStatus('Stopped')
    this.logDebug('Status set to: Stopped')
    this.logDebug('Hello AssemblyScript plugin stopped successfully!')
    this.logDebug('========================================')
    return 0 // Success
  }

  /**
   * Emit a welcome notification
   */
  private emitWelcomeNotification(): void {
    this.logDebug('Building welcome notification...')
    const notification = new Notification(
      NotificationState.normal,
      this.config.message
    )

    const source = new Source(this.id(), 'plugin')
    const timestamp = getCurrentTimestamp()
    this.logDebug(`Timestamp: ${timestamp}`)

    const pathValue = new PathValue(
      'notifications.hello',
      notification.toJSON()
    )

    const update = new Update(source, timestamp, [pathValue])
    const delta = new Delta('vessels.self', [update])

    emit(delta)
    this.logDebug('✓ Welcome notification emitted to path: notifications.hello')
  }

  /**
   * Emit a test delta with plugin information
   */
  private emitTestDelta(): void {
    this.logDebug('Building plugin info delta...')
    const pluginInfo = `{
      "name": "${this.name()}",
      "id": "${this.id()}",
      "language": "AssemblyScript",
      "version": "0.1.0"
    }`

    const source = new Source(this.id(), 'plugin')
    const timestamp = getCurrentTimestamp()
    this.logDebug(`Timestamp: ${timestamp}`)

    const pathValue = new PathValue(
      'plugins.hello-assemblyscript.info',
      pluginInfo
    )

    const update = new Update(source, timestamp, [pathValue])
    const delta = new Delta('vessels.self', [update])

    emit(delta)
    this.logDebug(
      '✓ Plugin info delta emitted to path: plugins.hello-assemblyscript.info'
    )
  }
}

// Export plugin instance
// Signal K server will call the exported functions
const plugin = new HelloPlugin()

// Plugin lifecycle exports
// Note: plugin_id() is no longer required - ID is derived from package.json name

export function plugin_name(): string {
  return plugin.name()
}

export function plugin_schema(): string {
  return plugin.schema()
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  // Read config string from memory
  const len = i32(configLen)
  const configBytes = new Uint8Array(len)
  for (let i: i32 = 0; i < len; i++) {
    configBytes[i] = load<u8>(configPtr + <usize>i)
  }
  const configJson = String.UTF8.decode(configBytes.buffer)

  return plugin.start(configJson)
}

export function plugin_stop(): i32 {
  return plugin.stop()
}

/**
 * HTTP Endpoints (Phase 2)
 * Register custom REST API endpoints
 */
export function http_endpoints(): string {
  return `[
    {
      "method": "GET",
      "path": "/api/info",
      "handler": "handle_get_info"
    },
    {
      "method": "GET",
      "path": "/api/status",
      "handler": "handle_get_status"
    }
  ]`
}

/**
 * Handle GET /api/info
 * Returns plugin information
 */
export function handle_get_info(requestPtr: usize, requestLen: usize): string {
  // Decode request from memory (not used in this simple example)
  const requestBytes = new Uint8Array(i32(requestLen))
  for (let i: i32 = 0; i < i32(requestLen); i++) {
    requestBytes[i] = load<u8>(requestPtr + <usize>i)
  }
  const requestJson = String.UTF8.decode(requestBytes.buffer)

  // Build response data
  // Note: pluginId is derived from package.json name
  const bodyJson = `{
    "pluginName": "${plugin.name()}",
    "language": "AssemblyScript",
    "version": "0.1.0",
    "message": "Hello from WASM!",
    "capabilities": ["delta", "notifications", "http-endpoints"]
  }`

  // Escape for embedding in JSON response
  const escapedBody = bodyJson.replaceAll('"', '\\"').replaceAll('\n', '\\n')

  // Return HTTP response
  return `{
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": "${escapedBody}"
  }`
}

/**
 * Handle GET /api/status
 * Returns runtime status
 */
export function handle_get_status(
  requestPtr: usize,
  requestLen: usize
): string {
  const requestBytes = new Uint8Array(i32(requestLen))
  for (let i: i32 = 0; i < i32(requestLen); i++) {
    requestBytes[i] = load<u8>(requestPtr + <usize>i)
  }
  const requestJson = String.UTF8.decode(requestBytes.buffer)

  const bodyJson = `{
    "status": "running",
    "uptime": "N/A",
    "memory": "sandboxed"
  }`

  const escapedBody = bodyJson.replaceAll('"', '\\"').replaceAll('\n', '\\n')

  return `{
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": "${escapedBody}"
  }`
}
