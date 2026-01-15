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
  Notification,
  NotificationState,
  emit,
  setStatus,
  setError,
  debug
} from '@signalk/assemblyscript-plugin-sdk/assembly'

/**
 * Plugin configuration interface
 */
class HelloConfig {
  message: string = 'Hello from AssemblyScript!'
  updateInterval: i32 = 5000
  enableDebugLogging: boolean = false
}

// Track elapsed time for polling (server calls poll() every ~1000ms)
let elapsedMs: i32 = 0
let pollCount: i32 = 0

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

    // Parse updateInterval from config (basic string parsing)
    const intervalKey = '"updateInterval":'
    const intervalIdx = configJson.indexOf(intervalKey)
    if (intervalIdx >= 0) {
      const startIdx = intervalIdx + intervalKey.length
      let endIdx = startIdx
      while (endIdx < configJson.length) {
        const c = configJson.charCodeAt(endIdx)
        if (c < 48 || c > 57) break // Not a digit (0-9)
        endIdx++
      }
      if (endIdx > startIdx) {
        const intervalStr = configJson.substring(startIdx, endIdx)
        this.config.updateInterval = i32(parseInt(intervalStr) as i32)
      }
    }

    // Reset poll counters
    elapsedMs = 0
    pollCount = 0

    this.logDebug('========================================')
    this.logDebug('Hello AssemblyScript plugin starting...')
    this.logDebug(`Plugin Name: ${this.name()}`)
    this.logDebug(`Configuration received: ${configJson}`)
    this.logDebug(
      `Debug logging: ${this.config.enableDebugLogging ? 'ENABLED' : 'DISABLED'}`
    )
    this.logDebug(`Update interval: ${this.config.updateInterval}ms`)
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

    const pathValue = new PathValue(
      'notifications.hello',
      notification.toJSON()
    )

    const update = new Update([pathValue])
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
      "language": "AssemblyScript",
      "version": "0.1.0"
    }`

    const pathValue = new PathValue(
      'plugins.hello-assemblyscript.info',
      pluginInfo
    )

    const update = new Update([pathValue])
    const delta = new Delta('vessels.self', [update])

    emit(delta)
    this.logDebug(
      '✓ Plugin info delta emitted to path: plugins.hello-assemblyscript.info'
    )
  }

  /**
   * Emit a periodic heartbeat delta
   */
  emitHeartbeat(): void {
    pollCount++
    this.logDebug(`Heartbeat #${pollCount}`)

    const heartbeatValue = `{
      "count": ${pollCount},
      "message": "${this.config.message}",
      "intervalMs": ${this.config.updateInterval}
    }`

    const pathValue = new PathValue(
      'plugins.hello-assemblyscript.heartbeat',
      heartbeatValue
    )

    const update = new Update([pathValue])
    const delta = new Delta('vessels.self', [update])

    emit(delta)
    this.logDebug(
      `✓ Heartbeat delta emitted to path: plugins.hello-assemblyscript.heartbeat`
    )
  }

  /**
   * Get update interval for polling
   */
  getUpdateInterval(): i32 {
    return this.config.updateInterval
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
 * Poll function - called by server every ~1000ms
 * Emits heartbeat delta when updateInterval has elapsed
 */
export function poll(): i32 {
  // Server calls poll() every ~1000ms
  elapsedMs += 1000

  // Check if it's time to emit a heartbeat
  if (elapsedMs >= plugin.getUpdateInterval()) {
    plugin.emitHeartbeat()
    elapsedMs = 0
  }

  return 0 // Success
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
