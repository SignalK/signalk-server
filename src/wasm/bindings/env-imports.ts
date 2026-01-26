/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * WASM Environment Imports (Host Bindings)
 *
 * Provides the Signal K API functions that WASM plugins can import
 */

import Debug from 'debug'
import { SKVersion } from '@signalk/server-api'
import { WasmCapabilities } from '../types'
import { createResourceProviderBinding } from './resource-provider'
import { createWeatherProviderBinding } from './weather-provider'
import {
  getEventManager,
  PLUGIN_EVENT_PREFIX,
  ServerEvent
} from '../wasm-events'
import {
  createRadarProviderBinding,
  createRadarEmitSpokesBinding
} from './radar-provider'
import {
  createBinaryStreamBinding,
  createBinaryDataReader
} from './binary-stream'
import { socketManager, tcpSocketManager } from './socket-manager'
import * as fs from 'fs'
import * as path from 'path'

const debug = Debug('signalk:wasm:bindings')

/**
 * Options for creating environment imports
 */
export interface EnvImportsOptions {
  pluginId: string
  capabilities: WasmCapabilities
  app?: any
  memoryRef: { current: WebAssembly.Memory | null }
  rawExports: { current: any }
  asLoaderInstance: { current: any }
  configPath?: string
  packageName?: string
}

/**
 * Helper to read UTF-8 strings from WASM memory
 */
export function createUtf8Reader(memoryRef: {
  current: WebAssembly.Memory | null
}) {
  return (ptr: number, len: number): string => {
    if (!memoryRef.current) {
      throw new Error('AssemblyScript module memory not initialized')
    }
    const bytes = new Uint8Array(memoryRef.current.buffer, ptr, len)
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(bytes)
  }
}

/**
 * Create environment imports for a WASM plugin
 */
export function createEnvImports(
  options: EnvImportsOptions
): Record<string, any> {
  const {
    pluginId,
    capabilities,
    app,
    memoryRef,
    rawExports,
    asLoaderInstance,
    configPath,
    packageName: _packageName
  } = options

  const readUtf8String = createUtf8Reader(memoryRef)
  const readBinaryData = createBinaryDataReader(memoryRef)

  const envImports: Record<string, any> = {
    // AssemblyScript runtime requirements
    abort: (msg: number, file: number, line: number, column: number) => {
      debug(`WASM abort called: ${msg} at ${file}:${line}:${column}`)
    },
    seed: () => {
      return Date.now() * Math.random()
    },
    'console.log': (ptr: number, len: number) => {
      try {
        const message = readUtf8String(ptr, len)
        debug(`[${pluginId}] ${message}`)
      } catch (error) {
        debug(`WASM console.log error: ${error}`)
      }
    },

    // Signal K API functions
    sk_debug: (ptr: number, len: number) => {
      try {
        const message = readUtf8String(ptr, len)
        debug(`[${pluginId}] ${message}`)
      } catch (error) {
        debug(`Plugin debug error: ${error}`)
      }
    },

    sk_set_status: (ptr: number, len: number) => {
      try {
        const message = readUtf8String(ptr, len)
        debug(`[${pluginId}] Status: ${message}`)
        if (app && app.setPluginStatus) {
          app.setPluginStatus(pluginId, message)
        }
      } catch (error) {
        debug(`Plugin set status error: ${error}`)
      }
    },

    sk_set_error: (ptr: number, len: number) => {
      try {
        const message = readUtf8String(ptr, len)
        debug(`[${pluginId}] Error: ${message}`)
        if (app && app.setPluginError) {
          app.setPluginError(pluginId, message)
        }
      } catch (error) {
        debug(`Plugin set error error: ${error}`)
      }
    },

    // Get value from vessels.self path
    sk_get_self_path: (
      pathPtr: number,
      pathLen: number,
      bufPtr: number,
      bufMaxLen: number
    ): number => {
      try {
        const path = readUtf8String(pathPtr, pathLen)
        debug(`[${pluginId}] getSelfPath: ${path}`)

        if (!app || !app.getSelfPath) {
          debug(`[${pluginId}] app.getSelfPath not available`)
          return 0
        }

        const value = app.getSelfPath(path)
        if (value === undefined || value === null) {
          return 0
        }

        // Serialize value to JSON
        const jsonStr = JSON.stringify(value)
        const jsonBytes = Buffer.from(jsonStr, 'utf8')

        if (jsonBytes.length > bufMaxLen) {
          debug(
            `[${pluginId}] getSelfPath buffer too small: need ${jsonBytes.length}, have ${bufMaxLen}`
          )
          return 0
        }

        // Write to WASM memory
        if (memoryRef.current) {
          const memView = new Uint8Array(memoryRef.current.buffer)
          memView.set(jsonBytes, bufPtr)
          return jsonBytes.length
        }

        return 0
      } catch (error) {
        debug(`[${pluginId}] getSelfPath error: ${error}`)
        return 0
      }
    },

    /**
     * Emit a delta message to the Signal K server
     *
     * @param ptr - Pointer to delta JSON string in WASM memory
     * @param len - Length of delta JSON string
     * @param version - Signal K version: 1 = v1 (default), 2 = v2
     *
     * Plugins should use v1 for regular navigation data (the default).
     * Use v2 for Course API paths and other v2-specific data to prevent
     * v2 data from being mixed into the v1 full data model.
     *
     * This mirrors the TypeScript plugin API where handleMessage accepts
     * an optional skVersion parameter.
     */
    sk_handle_message: (ptr: number, len: number, version: number = 1) => {
      try {
        const deltaJson = readUtf8String(ptr, len)
        debug(
          `[${pluginId}] Emitting delta (v${version === 2 ? '2' : '1'}): ${deltaJson.substring(0, 200)}...`
        )
        if (app && app.handleMessage) {
          try {
            const delta = JSON.parse(deltaJson)
            const skVersion = version === 2 ? SKVersion.v2 : SKVersion.v1
            app.handleMessage(pluginId, delta, skVersion)
            debug(`[${pluginId}] Delta processed by server (${skVersion})`)
          } catch (parseError) {
            debug(`[${pluginId}] Failed to parse/process delta: ${parseError}`)
          }
        } else {
          debug(
            `[${pluginId}] Warning: app.handleMessage not available, delta not processed`
          )
        }
      } catch (error) {
        debug(`Plugin handle message error: ${error}`)
      }
    },

    /**
     * Publish a SignalK notification (v6)
     *
     * @param pathPtr - Pointer to notification path string (e.g., "notifications.navigation.closestApproach.radar:1:target:5")
     * @param pathLen - Length of path string
     * @param valuePtr - Pointer to notification value JSON
     * @param valueLen - Length of value JSON
     * @returns 0 on success, -1 on error
     */
    sk_publish_notification: (
      pathPtr: number,
      pathLen: number,
      valuePtr: number,
      valueLen: number
    ): number => {
      try {
        const path = readUtf8String(pathPtr, pathLen)
        const valueJson = readUtf8String(valuePtr, valueLen)

        debug(`[${pluginId}] Publishing notification: ${path}`)

        if (!app || !app.handleMessage) {
          debug(`[${pluginId}] app.handleMessage not available`)
          return -1
        }

        // Parse and validate the notification value
        let notificationValue: any
        try {
          notificationValue = JSON.parse(valueJson)
        } catch (e) {
          debug(`[${pluginId}] Invalid notification JSON: ${e}`)
          return -1
        }

        // Validate required notification fields per SignalK spec
        // Notifications must have: state, method, message
        if (!notificationValue.state) {
          debug(`[${pluginId}] Notification missing required 'state' field`)
          return -1
        }

        const validStates = ['normal', 'alert', 'warn', 'alarm', 'emergency']
        if (!validStates.includes(notificationValue.state)) {
          debug(
            `[${pluginId}] Invalid notification state: ${notificationValue.state}`
          )
          return -1
        }

        // Build the delta message for the notification
        const delta = {
          updates: [
            {
              values: [
                {
                  path: path,
                  value: notificationValue
                }
              ]
            }
          ]
        }

        // Notifications should be processed normally (version 1)
        app.handleMessage(pluginId, delta)
        debug(
          `[${pluginId}] Notification published: ${path} state=${notificationValue.state}`
        )

        return 0 // Success
      } catch (error) {
        debug(`[${pluginId}] sk_publish_notification error: ${error}`)
        return -1
      }
    },

    // ==========================================================================
    // Plugin Configuration API
    // ==========================================================================

    /**
     * Read plugin configuration from plugin-config-data
     * Uses: ~/.signalk/plugin-config-data/{pluginId}.json
     *
     * This matches the storage location used by JS plugins.
     *
     * @param bufPtr - Buffer to write config JSON into
     * @param bufMaxLen - Maximum buffer size
     * @returns Number of bytes written, or 0 if no config / error
     */
    sk_read_config: (bufPtr: number, bufMaxLen: number): number => {
      try {
        const cfgPath = configPath || app?.config?.configPath
        if (!cfgPath) {
          debug(`[${pluginId}] sk_read_config: configPath not available`)
          return 0
        }

        // Plugin config path: plugin-config-data/{pluginId}.json (same as JS plugins)
        const configFile = path.join(
          cfgPath,
          'plugin-config-data',
          `${pluginId}.json`
        )

        let configJson = '{}'
        if (fs.existsSync(configFile)) {
          try {
            const rawConfig = fs.readFileSync(configFile, 'utf8')
            const parsed = JSON.parse(rawConfig)
            // Return just the configuration object (not enabled/enableLogging flags)
            configJson = JSON.stringify(parsed.configuration || {})
          } catch (e) {
            debug(`[${pluginId}] Could not read config: ${e}`)
          }
        }

        debug(
          `[${pluginId}] Reading config from ${configFile}: ${configJson.substring(0, 100)}...`
        )

        const encoder = new TextEncoder()
        const configBytes = encoder.encode(configJson)

        if (configBytes.length > bufMaxLen) {
          debug(
            `[${pluginId}] Config buffer too small: need ${configBytes.length}, have ${bufMaxLen}`
          )
          return 0
        }

        if (!memoryRef.current) return 0
        const memView = new Uint8Array(memoryRef.current.buffer)
        memView.set(configBytes, bufPtr)

        return configBytes.length
      } catch (error) {
        debug(`[${pluginId}] sk_read_config error: ${error}`)
        return 0
      }
    },

    /**
     * Save plugin configuration to plugin-config-data
     * Uses: ~/.signalk/plugin-config-data/{pluginId}.json
     *
     * This matches the storage location used by JS plugins.
     *
     * @param configPtr - Pointer to config JSON string
     * @param configLen - Length of config JSON
     * @returns 0 on success, negative on error
     */
    sk_save_config: (configPtr: number, configLen: number): number => {
      try {
        const cfgPath = configPath || app?.config?.configPath
        if (!cfgPath) {
          debug(`[${pluginId}] sk_save_config: configPath not available`)
          return -1
        }

        const configJson = readUtf8String(configPtr, configLen)
        debug(`[${pluginId}] Saving config: ${configJson.substring(0, 100)}...`)

        // Validate JSON
        const configuration = JSON.parse(configJson)

        // Plugin config path: plugin-config-data/{pluginId}.json (same as JS plugins)
        const configDataDir = path.join(cfgPath, 'plugin-config-data')
        const configFile = path.join(configDataDir, `${pluginId}.json`)

        // Create directory if needed
        if (!fs.existsSync(configDataDir)) {
          fs.mkdirSync(configDataDir, { recursive: true })
        }

        // Read existing config to preserve enabled/enableLogging flags
        let existingConfig: any = { enabled: true }
        if (fs.existsSync(configFile)) {
          try {
            existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'))
          } catch (e) {
            debug(`[${pluginId}] Could not read existing config: ${e}`)
          }
        }

        // Update configuration while preserving other fields
        existingConfig.configuration = configuration

        fs.writeFileSync(
          configFile,
          JSON.stringify(existingConfig, null, 2),
          'utf8'
        )
        debug(`[${pluginId}] Config saved to ${configFile}`)

        return 0
      } catch (error) {
        debug(`[${pluginId}] sk_save_config error: ${error}`)
        return -1
      }
    },

    // Capability checking
    sk_has_capability: (capPtr: number, capLen: number): number => {
      try {
        const capability = readUtf8String(capPtr, capLen)
        debug(`[${pluginId}] Checking capability: ${capability}`)
        if (capability === 'network') {
          return capabilities.network ? 1 : 0
        }
        if (capability === 'rawSockets') {
          return capabilities.rawSockets ? 1 : 0
        }
        return 0
      } catch (error) {
        debug(`Plugin capability check error: ${error}`)
        return 0
      }
    },

    // PUT Handler Registration
    sk_register_put_handler: (
      contextPtr: number,
      contextLen: number,
      pathPtr: number,
      pathLen: number
    ): number => {
      try {
        const context = readUtf8String(contextPtr, contextLen)
        const path = readUtf8String(pathPtr, pathLen)
        debug(
          `[${pluginId}] Registering PUT handler: context=${context}, path=${path}`
        )

        if (!capabilities.putHandlers) {
          debug(`[${pluginId}] PUT handlers capability not granted`)
          return 0
        }

        debug(
          `[${pluginId}] app available: ${!!app}, app.registerActionHandler available: ${!!(app && app.registerActionHandler)}`
        )

        if (app && app.registerActionHandler) {
          // Send meta message to indicate this path supports PUT
          if (app.handleMessage) {
            app.handleMessage(pluginId, {
              updates: [
                {
                  meta: [
                    {
                      path: path,
                      value: { supportsPut: true }
                    }
                  ]
                }
              ]
            })
            debug(`[${pluginId}] Sent supportsPut meta for ${path}`)
          }

          const callback = (
            cbContext: string,
            cbPath: string,
            value: any,
            cb: (result: any) => void
          ) => {
            debug(
              `[${pluginId}] PUT request received: ${cbContext}.${cbPath} = ${JSON.stringify(value)}`
            )

            const handlerName = `handle_put_${cbContext.replace(/\./g, '_')}_${cbPath.replace(/\./g, '_')}`
            const exports =
              asLoaderInstance.current?.exports || rawExports.current
            const handlerFunc = exports?.[handlerName]

            if (handlerFunc) {
              debug(`[${pluginId}] Calling WASM handler: ${handlerName}`)
              const valueJson = JSON.stringify(value)

              try {
                let responseJson: string

                if (asLoaderInstance.current) {
                  responseJson = handlerFunc(valueJson)
                } else if (rawExports.current?.allocate) {
                  // Rust library plugin: buffer-based string passing
                  const valueBytes = Buffer.from(valueJson, 'utf8')
                  const valuePtr = rawExports.current.allocate(
                    valueBytes.length
                  )
                  const responseMaxLen = 8192
                  const responsePtr =
                    rawExports.current.allocate(responseMaxLen)

                  const memory = rawExports.current.memory as WebAssembly.Memory
                  const memView = new Uint8Array(memory.buffer)
                  memView.set(valueBytes, valuePtr)

                  const writtenLen = handlerFunc(
                    valuePtr,
                    valueBytes.length,
                    responsePtr,
                    responseMaxLen
                  )

                  const responseBytes = new Uint8Array(
                    memory.buffer,
                    responsePtr,
                    writtenLen
                  )
                  responseJson = new TextDecoder('utf-8').decode(responseBytes)

                  if (rawExports.current.deallocate) {
                    rawExports.current.deallocate(valuePtr, valueBytes.length)
                    rawExports.current.deallocate(responsePtr, responseMaxLen)
                  }
                } else {
                  throw new Error('Unknown plugin type for PUT handler')
                }

                const response = JSON.parse(responseJson)
                debug(
                  `[${pluginId}] PUT handler response: ${JSON.stringify(response)}`
                )
                cb(response)
              } catch (error) {
                debug(`[${pluginId}] PUT handler error: ${error}`)
                cb({
                  state: 'COMPLETED',
                  statusCode: 500,
                  message: `Handler error: ${error}`
                })
              }
            } else {
              debug(
                `[${pluginId}] Warning: Handler function not found: ${handlerName}`
              )
              cb({
                state: 'COMPLETED',
                statusCode: 501,
                message: 'Handler not implemented'
              })
            }
          }

          app.registerActionHandler(context, path, pluginId, callback)
          debug(
            `[${pluginId}] PUT handler registered successfully via registerActionHandler`
          )
          return 1
        } else {
          debug(`[${pluginId}] app.registerActionHandler not available`)
          return 0
        }
      } catch (error) {
        debug(`Plugin register PUT handler error: ${error}`)
        return 0
      }
    },

    // Resource Provider Registration
    sk_register_resource_provider: createResourceProviderBinding(
      pluginId,
      capabilities,
      app,
      readUtf8String
    ),

    // Weather Provider Registration
    sk_register_weather_provider: createWeatherProviderBinding(
      pluginId,
      capabilities,
      app,
      readUtf8String
    ),

    // Radar Provider Registration
    sk_register_radar_provider: createRadarProviderBinding(
      pluginId,
      capabilities,
      app,
      readUtf8String
    ),

    // ==========================================================================
    // Binary Stream API (for high-frequency data streaming)
    // ==========================================================================

    /**
     * Emit binary data to a stream
     * General-purpose binary streaming for any plugin
     * @param streamIdPtr - Pointer to stream ID string
     * @param streamIdLen - Length of stream ID
     * @param dataPtr - Pointer to binary data
     * @param dataLen - Length of binary data
     * @returns 1 on success, 0 on failure
     */
    sk_emit_binary_stream: createBinaryStreamBinding(
      pluginId,
      app,
      readUtf8String,
      readBinaryData
    ),

    /**
     * Emit radar spoke data
     * Convenience wrapper for radar providers
     * @param radarIdPtr - Pointer to radar ID string
     * @param radarIdLen - Length of radar ID
     * @param spokeDataPtr - Pointer to binary spoke data (protobuf)
     * @param spokeDataLen - Length of spoke data
     * @returns 1 on success, 0 on failure
     */
    sk_radar_emit_spokes: createRadarEmitSpokesBinding(
      pluginId,
      capabilities,
      app,
      readUtf8String,
      readBinaryData
    ),

    // ==========================================================================
    // Raw Socket API (for radar, NMEA, etc.)
    // Requires rawSockets capability
    // ==========================================================================

    /**
     * Create a UDP socket
     * @param type - 0 for udp4, 1 for udp6
     * @returns Socket ID (>0), or -1 on error
     */
    sk_udp_create: (type: number): number => {
      if (!capabilities.rawSockets) {
        debug(`[${pluginId}] rawSockets capability not granted`)
        return -1
      }
      const socketType = type === 1 ? 'udp6' : 'udp4'
      return socketManager.createSocket(pluginId, socketType)
    },

    /**
     * Bind socket to a port
     * @param socketId - Socket ID from sk_udp_create
     * @param port - Port number (0 for any available)
     * @returns 0 on success, -1 on error
     */
    sk_udp_bind: (socketId: number, port: number): number => {
      if (!capabilities.rawSockets) return -1
      // Note: bind is async but we return immediately and let it complete
      // The socket will be ready by the time we try to receive
      socketManager.bind(socketId, port).catch((err) => {
        debug(`[${pluginId}] Async bind error: ${err}`)
      })
      return 0
    },

    /**
     * Join a multicast group
     * @param socketId - Socket ID
     * @param addrPtr - Pointer to multicast address string
     * @param addrLen - Length of address string
     * @param ifacePtr - Pointer to interface address (0 for default)
     * @param ifaceLen - Length of interface string
     * @returns 0 on success, -1 on error
     */
    sk_udp_join_multicast: (
      socketId: number,
      addrPtr: number,
      addrLen: number,
      ifacePtr: number,
      ifaceLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const multicastAddr = readUtf8String(addrPtr, addrLen)
        const interfaceAddr =
          ifaceLen > 0 ? readUtf8String(ifacePtr, ifaceLen) : undefined
        debug(
          `[${pluginId}] Joining multicast ${multicastAddr} on interface ${interfaceAddr || 'default'}`
        )
        return socketManager.joinMulticast(
          socketId,
          multicastAddr,
          interfaceAddr
        )
      } catch (error) {
        debug(`[${pluginId}] Join multicast error: ${error}`)
        return -1
      }
    },

    /**
     * Leave a multicast group
     */
    sk_udp_leave_multicast: (
      socketId: number,
      addrPtr: number,
      addrLen: number,
      ifacePtr: number,
      ifaceLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const multicastAddr = readUtf8String(addrPtr, addrLen)
        const interfaceAddr =
          ifaceLen > 0 ? readUtf8String(ifacePtr, ifaceLen) : undefined
        return socketManager.leaveMulticast(
          socketId,
          multicastAddr,
          interfaceAddr
        )
      } catch (error) {
        debug(`[${pluginId}] Leave multicast error: ${error}`)
        return -1
      }
    },

    /**
     * Set multicast TTL
     */
    sk_udp_set_multicast_ttl: (socketId: number, ttl: number): number => {
      if (!capabilities.rawSockets) return -1
      return socketManager.setMulticastTTL(socketId, ttl)
    },

    /**
     * Enable/disable multicast loopback
     */
    sk_udp_set_multicast_loopback: (
      socketId: number,
      enabled: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      return socketManager.setMulticastLoopback(socketId, enabled !== 0)
    },

    /**
     * Enable/disable broadcast
     */
    sk_udp_set_broadcast: (socketId: number, enabled: number): number => {
      if (!capabilities.rawSockets) return -1
      return socketManager.setBroadcast(socketId, enabled !== 0)
    },

    /**
     * Send data via UDP
     * @param socketId - Socket ID
     * @param addrPtr - Destination address pointer
     * @param addrLen - Destination address length
     * @param port - Destination port
     * @param dataPtr - Data pointer
     * @param dataLen - Data length
     * @returns Bytes sent, or -1 on error
     */
    sk_udp_send: (
      socketId: number,
      addrPtr: number,
      addrLen: number,
      port: number,
      dataPtr: number,
      dataLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const address = readUtf8String(addrPtr, addrLen)
        if (!memoryRef.current) return -1
        const data = Buffer.from(
          new Uint8Array(memoryRef.current.buffer, dataPtr, dataLen)
        )

        // Send is async, but we return 0 immediately and let it complete
        socketManager.send(socketId, data, address, port).catch((err) => {
          debug(`[${pluginId}] Async send error: ${err}`)
        })
        return dataLen // Optimistically return bytes "sent"
      } catch (error) {
        debug(`[${pluginId}] Send error: ${error}`)
        return -1
      }
    },

    /**
     * Receive data from UDP socket (non-blocking)
     * @param socketId - Socket ID
     * @param bufPtr - Buffer to write data into
     * @param bufMaxLen - Maximum buffer size
     * @param addrOutPtr - Buffer to write source address (at least 46 bytes for IPv6)
     * @param portOutPtr - Pointer to write source port (u16)
     * @returns Bytes received, 0 if no data, -1 on error
     */
    sk_udp_recv: (
      socketId: number,
      bufPtr: number,
      bufMaxLen: number,
      addrOutPtr: number,
      portOutPtr: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const datagram = socketManager.receive(socketId)
        if (!datagram) {
          return 0 // No data available
        }

        if (!memoryRef.current) return -1
        const memory = memoryRef.current
        const memView = new Uint8Array(memory.buffer)

        // Copy data to buffer
        const bytesToCopy = Math.min(datagram.data.length, bufMaxLen)
        memView.set(datagram.data.slice(0, bytesToCopy), bufPtr)

        // Write source address (null-terminated string)
        const addrBytes = Buffer.from(datagram.address + '\0', 'utf8')
        memView.set(addrBytes, addrOutPtr)

        // Write source port (u16, little-endian)
        const portView = new DataView(memory.buffer)
        portView.setUint16(portOutPtr, datagram.port, true)

        return bytesToCopy
      } catch (error) {
        debug(`[${pluginId}] Recv error: ${error}`)
        return -1
      }
    },

    /**
     * Get number of buffered datagrams waiting to be received
     */
    sk_udp_pending: (socketId: number): number => {
      if (!capabilities.rawSockets) return -1
      return socketManager.getBufferedCount(socketId)
    },

    /**
     * Close a socket
     */
    sk_udp_close: (socketId: number): void => {
      if (!capabilities.rawSockets) return
      socketManager.close(socketId)
    },

    // ==========================================================================
    // TCP Socket API (for protocols requiring persistent connections)
    // Requires rawSockets capability
    // ==========================================================================

    /**
     * Create a TCP socket
     * @returns Socket ID (>0), or -1 on error
     */
    sk_tcp_create: (): number => {
      if (!capabilities.rawSockets) {
        debug(`[${pluginId}] rawSockets capability not granted`)
        return -1
      }
      return tcpSocketManager.createSocket(pluginId)
    },

    /**
     * Connect TCP socket to remote host
     * @param socketId - Socket ID from sk_tcp_create
     * @param addrPtr - Pointer to host address string
     * @param addrLen - Length of address string
     * @param port - Remote port number
     * @returns 0 if connection initiated, -1 on error
     */
    sk_tcp_connect: (
      socketId: number,
      addrPtr: number,
      addrLen: number,
      port: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const address = readUtf8String(addrPtr, addrLen)
        debug(`[${pluginId}] TCP connecting to ${address}:${port}`)
        return tcpSocketManager.connect(socketId, address, port)
      } catch (error) {
        debug(`[${pluginId}] TCP connect error: ${error}`)
        return -1
      }
    },

    /**
     * Check if TCP socket is connected
     * @param socketId - Socket ID
     * @returns 1 if connected, 0 if not, -1 if socket not found
     */
    sk_tcp_connected: (socketId: number): number => {
      if (!capabilities.rawSockets) return -1
      return tcpSocketManager.isConnected(socketId)
    },

    /**
     * Set TCP socket buffering mode
     * @param socketId - Socket ID
     * @param lineBuffering - 1 for line-buffered (text), 0 for raw (binary)
     * @returns 0 on success, -1 on error
     */
    sk_tcp_set_line_buffering: (
      socketId: number,
      lineBuffering: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      return tcpSocketManager.setLineBuffering(socketId, lineBuffering !== 0)
    },

    /**
     * Send data via TCP
     * @param socketId - Socket ID
     * @param dataPtr - Data pointer
     * @param dataLen - Data length
     * @returns Bytes sent, or -1 on error
     */
    sk_tcp_send: (
      socketId: number,
      dataPtr: number,
      dataLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        if (!memoryRef.current) return -1
        const data = Buffer.from(
          new Uint8Array(memoryRef.current.buffer, dataPtr, dataLen)
        )

        // Send is async, but we return immediately
        tcpSocketManager.send(socketId, data).catch((err) => {
          debug(`[${pluginId}] Async TCP send error: ${err}`)
        })
        return dataLen
      } catch (error) {
        debug(`[${pluginId}] TCP send error: ${error}`)
        return -1
      }
    },

    /**
     * Receive a complete line from TCP socket (non-blocking)
     * Only works in line-buffered mode
     * @param socketId - Socket ID
     * @param bufPtr - Buffer to write line into (without line ending)
     * @param bufMaxLen - Maximum buffer size
     * @returns Bytes received, 0 if no complete line, -1 on error
     */
    sk_tcp_recv_line: (
      socketId: number,
      bufPtr: number,
      bufMaxLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const line = tcpSocketManager.receiveLine(socketId)
        if (!line) {
          return 0 // No complete line available
        }

        if (!memoryRef.current) return -1
        const memory = memoryRef.current
        const memView = new Uint8Array(memory.buffer)

        // Convert line to bytes and copy to buffer
        const lineBytes = Buffer.from(line, 'utf8')
        const bytesToCopy = Math.min(lineBytes.length, bufMaxLen)
        memView.set(lineBytes.slice(0, bytesToCopy), bufPtr)

        return bytesToCopy
      } catch (error) {
        debug(`[${pluginId}] TCP recv line error: ${error}`)
        return -1
      }
    },

    /**
     * Receive raw data from TCP socket (non-blocking)
     * Only works in raw mode
     * @param socketId - Socket ID
     * @param bufPtr - Buffer to write data into
     * @param bufMaxLen - Maximum buffer size
     * @returns Bytes received, 0 if no data, -1 on error
     */
    sk_tcp_recv_raw: (
      socketId: number,
      bufPtr: number,
      bufMaxLen: number
    ): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const data = tcpSocketManager.receiveRaw(socketId)
        if (!data) {
          return 0 // No data available
        }

        if (!memoryRef.current) return -1
        const memory = memoryRef.current
        const memView = new Uint8Array(memory.buffer)

        const bytesToCopy = Math.min(data.length, bufMaxLen)
        memView.set(data.slice(0, bytesToCopy), bufPtr)

        return bytesToCopy
      } catch (error) {
        debug(`[${pluginId}] TCP recv raw error: ${error}`)
        return -1
      }
    },

    /**
     * Get number of buffered items waiting to be received
     */
    sk_tcp_pending: (socketId: number): number => {
      if (!capabilities.rawSockets) return -1
      return tcpSocketManager.getBufferedCount(socketId)
    },

    /**
     * Close a TCP socket
     */
    sk_tcp_close: (socketId: number): void => {
      if (!capabilities.rawSockets) return
      tcpSocketManager.close(socketId)
    },

    // ==========================================================================
    // Server Events API
    // Allows WASM plugins to receive server events and emit custom events
    // Requires serverEvents capability
    // ==========================================================================

    /**
     * Subscribe to server events
     *
     * @param eventTypesPtr - Pointer to JSON array of event types (e.g., '["SERVERSTATISTICS", "VESSEL_INFO"]')
     *                        Empty array '[]' subscribes to all allowed events
     * @param eventTypesLen - Length of event types JSON string
     * @returns 1 on success, 0 on failure (capability not granted or invalid JSON)
     *
     * Note: The actual event delivery happens via the event_handler export.
     * Plugin must export: event_handler(eventJson: string) -> void
     */
    sk_subscribe_events: (
      eventTypesPtr: number,
      eventTypesLen: number
    ): number => {
      if (!capabilities.serverEvents) {
        debug(`[${pluginId}] serverEvents capability not granted`)
        return 0
      }

      try {
        const eventTypesJson = readUtf8String(eventTypesPtr, eventTypesLen)
        const eventTypes: string[] = JSON.parse(eventTypesJson)

        if (!Array.isArray(eventTypes)) {
          debug(
            `[${pluginId}] sk_subscribe_events: expected array, got ${typeof eventTypes}`
          )
          return 0
        }

        debug(
          `[${pluginId}] Subscribing to events: ${eventTypes.length === 0 ? 'all allowed' : eventTypes.join(', ')}`
        )

        const eventManager = getEventManager()
        eventManager.register(pluginId, eventTypes, (event: ServerEvent) => {
          debug(
            `[${pluginId}] Event received but handler not yet configured: ${event.type}`
          )
        })

        return 1
      } catch (error) {
        debug(`[${pluginId}] sk_subscribe_events error: ${error}`)
        return 0
      }
    },

    /**
     * Emit a custom event from the plugin
     *
     * @param typePtr - Pointer to event type string (will be prefixed with 'PLUGIN_' if not already)
     * @param typeLen - Length of event type string
     * @param dataPtr - Pointer to event data JSON string
     * @param dataLen - Length of event data JSON string
     * @returns 1 on success, 0 on failure
     *
     * Security: Event type will always be prefixed with 'PLUGIN_' to prevent
     * plugins from impersonating server events. The 'from' field is automatically
     * set to the plugin ID.
     */
    sk_emit_event: (
      typePtr: number,
      typeLen: number,
      dataPtr: number,
      dataLen: number
    ): number => {
      if (!capabilities.serverEvents) {
        debug(`[${pluginId}] serverEvents capability not granted`)
        return 0
      }

      try {
        let eventType = readUtf8String(typePtr, typeLen)
        const dataJson = readUtf8String(dataPtr, dataLen)

        let data: unknown
        try {
          data = JSON.parse(dataJson)
        } catch {
          debug(`[${pluginId}] sk_emit_event: invalid JSON data`)
          return 0
        }

        if (!eventType.startsWith(PLUGIN_EVENT_PREFIX)) {
          eventType = PLUGIN_EVENT_PREFIX + eventType
        }

        debug(`[${pluginId}] Emitting event: ${eventType}`)

        const event: ServerEvent = {
          type: eventType,
          from: pluginId,
          data,
          timestamp: Date.now()
        }

        if (app && app.emit) {
          app.emit(eventType, event)
          debug(`[${pluginId}] Event emitted to server bus: ${eventType}`)
        }

        const eventManager = getEventManager()
        eventManager.routeEvent(event)

        return 1
      } catch (error) {
        debug(`[${pluginId}] sk_emit_event error: ${error}`)
        return 0
      }
    },

    /**
     * Get list of allowed event types that WASM plugins can subscribe to
     *
     * @param bufPtr - Buffer to write JSON array of allowed event types
     * @param bufMaxLen - Maximum buffer size
     * @returns Number of bytes written, or 0 if buffer too small / error
     */
    sk_get_allowed_event_types: (bufPtr: number, bufMaxLen: number): number => {
      try {
        const eventManager = getEventManager()
        const allowedTypes = eventManager.getAllowedEventTypes()
        const jsonStr = JSON.stringify(allowedTypes)
        const jsonBytes = Buffer.from(jsonStr, 'utf8')

        if (jsonBytes.length > bufMaxLen) {
          debug(`[${pluginId}] sk_get_allowed_event_types: buffer too small`)
          return 0
        }

        if (memoryRef.current) {
          const memView = new Uint8Array(memoryRef.current.buffer)
          memView.set(jsonBytes, bufPtr)
          return jsonBytes.length
        }

        return 0
      } catch (error) {
        debug(`[${pluginId}] sk_get_allowed_event_types error: ${error}`)
        return 0
      }
    }
  }

  return envImports
}
