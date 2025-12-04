/**
 * WASM Environment Imports (Host Bindings)
 *
 * Provides the Signal K API functions that WASM plugins can import
 */

import Debug from 'debug'
import { WasmCapabilities } from '../types'
import { createResourceProviderBinding } from './resource-provider'
import { createWeatherProviderBinding } from './weather-provider'
import { socketManager } from './socket-manager'

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
}

/**
 * Helper to read UTF-8 strings from WASM memory
 */
export function createUtf8Reader(memoryRef: { current: WebAssembly.Memory | null }) {
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
export function createEnvImports(options: EnvImportsOptions): Record<string, any> {
  const { pluginId, capabilities, app, memoryRef, rawExports, asLoaderInstance } = options

  const readUtf8String = createUtf8Reader(memoryRef)

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
    sk_get_self_path: (pathPtr: number, pathLen: number, bufPtr: number, bufMaxLen: number): number => {
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
          debug(`[${pluginId}] getSelfPath buffer too small: need ${jsonBytes.length}, have ${bufMaxLen}`)
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

    sk_handle_message: (ptr: number, len: number) => {
      try {
        const deltaJson = readUtf8String(ptr, len)
        debug(`[${pluginId}] Emitting delta: ${deltaJson.substring(0, 200)}...`)
        if (app && app.handleMessage) {
          try {
            const delta = JSON.parse(deltaJson)

            // Check if this is a resource delta - if so, use version 2
            // Resources should not be in the full model cache
            // See: docs/develop/plugins/resource_provider_plugins.md
            let isResourceDelta = false
            if (delta.updates) {
              for (const update of delta.updates) {
                if (update.values) {
                  for (const value of update.values) {
                    if (value.path && value.path.startsWith('resources.')) {
                      isResourceDelta = true
                      break
                    }
                  }
                }
                if (isResourceDelta) break
              }
            }

            if (isResourceDelta) {
              app.handleMessage(pluginId, delta, 2) // v2 for resources
              debug(`[${pluginId}] Resource delta processed (v2)`)
            } else {
              app.handleMessage(pluginId, delta)
              debug(`[${pluginId}] Delta processed by server`)
            }
          } catch (parseError) {
            debug(`[${pluginId}] Failed to parse/process delta: ${parseError}`)
          }
        } else {
          debug(`[${pluginId}] Warning: app.handleMessage not available, delta not processed`)
        }
      } catch (error) {
        debug(`Plugin handle message error: ${error}`)
      }
    },

    // Privileged operation: Execute shell command (for log reading, journalctl, etc.)
    sk_exec_command: (cmdPtr: number, cmdLen: number, outPtr: number, outMaxLen: number): number => {
      try {
        const command = readUtf8String(cmdPtr, cmdLen)
        debug(`[${pluginId}] Executing command: ${command}`)

        // Security: Only allow specific whitelisted commands for logs
        const allowedCommands = [
          /^journalctl\s+-u\s+signalk/,  // journalctl for signalk service
          /^cat\s+\/var\/log\//,         // Read log files
          /^tail\s+-n\s+\d+\s+\//,       // Tail log files
        ]

        const isAllowed = allowedCommands.some(pattern => pattern.test(command))
        if (!isAllowed) {
          debug(`[${pluginId}] Command not allowed: ${command}`)
          return 0 // Return 0 bytes written
        }

        // Execute command
        const { execSync } = require('child_process')
        const output = execSync(command, {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024, // 10MB max
          timeout: 30000 // 30 second timeout
        })

        // Write output to WASM memory
        const outputBytes = Buffer.from(output, 'utf8')
        const bytesToWrite = Math.min(outputBytes.length, outMaxLen)

        if (rawExports.current?.memory) {
          const memory = rawExports.current.memory as WebAssembly.Memory
          const memView = new Uint8Array(memory.buffer)
          memView.set(outputBytes.slice(0, bytesToWrite), outPtr)
        }

        return bytesToWrite
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        debug(`[${pluginId}] Command execution error: ${errorMsg}`)
        return 0
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
    sk_register_put_handler: (contextPtr: number, contextLen: number, pathPtr: number, pathLen: number): number => {
      try {
        const context = readUtf8String(contextPtr, contextLen)
        const path = readUtf8String(pathPtr, pathLen)
        debug(`[${pluginId}] Registering PUT handler: context=${context}, path=${path}`)

        if (!capabilities.putHandlers) {
          debug(`[${pluginId}] PUT handlers capability not granted`)
          return 0
        }

        debug(`[${pluginId}] app available: ${!!app}, app.registerActionHandler available: ${!!(app && app.registerActionHandler)}`)

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

          const callback = (cbContext: string, cbPath: string, value: any, cb: (result: any) => void) => {
            debug(`[${pluginId}] PUT request received: ${cbContext}.${cbPath} = ${JSON.stringify(value)}`)

            const handlerName = `handle_put_${cbContext.replace(/\./g, '_')}_${cbPath.replace(/\./g, '_')}`
            const exports = asLoaderInstance.current?.exports || rawExports.current
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
                  const valuePtr = rawExports.current.allocate(valueBytes.length)
                  const responseMaxLen = 8192
                  const responsePtr = rawExports.current.allocate(responseMaxLen)

                  const memory = rawExports.current.memory as WebAssembly.Memory
                  const memView = new Uint8Array(memory.buffer)
                  memView.set(valueBytes, valuePtr)

                  const writtenLen = handlerFunc(valuePtr, valueBytes.length, responsePtr, responseMaxLen)

                  const responseBytes = new Uint8Array(memory.buffer, responsePtr, writtenLen)
                  responseJson = new TextDecoder('utf-8').decode(responseBytes)

                  if (rawExports.current.deallocate) {
                    rawExports.current.deallocate(valuePtr, valueBytes.length)
                    rawExports.current.deallocate(responsePtr, responseMaxLen)
                  }
                } else {
                  throw new Error('Unknown plugin type for PUT handler')
                }

                const response = JSON.parse(responseJson)
                debug(`[${pluginId}] PUT handler response: ${JSON.stringify(response)}`)
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
              debug(`[${pluginId}] Warning: Handler function not found: ${handlerName}`)
              cb({
                state: 'COMPLETED',
                statusCode: 501,
                message: 'Handler not implemented'
              })
            }
          }

          app.registerActionHandler(context, path, pluginId, callback)
          debug(`[${pluginId}] PUT handler registered successfully via registerActionHandler`)
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
    sk_register_resource_provider: createResourceProviderBinding(pluginId, capabilities, app, readUtf8String),

    // Weather Provider Registration
    sk_register_weather_provider: createWeatherProviderBinding(pluginId, capabilities, app, readUtf8String),

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
      socketManager.bind(socketId, port).catch(err => {
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
    sk_udp_join_multicast: (socketId: number, addrPtr: number, addrLen: number, ifacePtr: number, ifaceLen: number): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const multicastAddr = readUtf8String(addrPtr, addrLen)
        const interfaceAddr = ifaceLen > 0 ? readUtf8String(ifacePtr, ifaceLen) : undefined
        debug(`[${pluginId}] Joining multicast ${multicastAddr} on interface ${interfaceAddr || 'default'}`)
        return socketManager.joinMulticast(socketId, multicastAddr, interfaceAddr)
      } catch (error) {
        debug(`[${pluginId}] Join multicast error: ${error}`)
        return -1
      }
    },

    /**
     * Leave a multicast group
     */
    sk_udp_leave_multicast: (socketId: number, addrPtr: number, addrLen: number, ifacePtr: number, ifaceLen: number): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const multicastAddr = readUtf8String(addrPtr, addrLen)
        const interfaceAddr = ifaceLen > 0 ? readUtf8String(ifacePtr, ifaceLen) : undefined
        return socketManager.leaveMulticast(socketId, multicastAddr, interfaceAddr)
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
    sk_udp_set_multicast_loopback: (socketId: number, enabled: number): number => {
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
    sk_udp_send: (socketId: number, addrPtr: number, addrLen: number, port: number, dataPtr: number, dataLen: number): number => {
      if (!capabilities.rawSockets) return -1
      try {
        const address = readUtf8String(addrPtr, addrLen)
        if (!memoryRef.current) return -1
        const data = Buffer.from(new Uint8Array(memoryRef.current.buffer, dataPtr, dataLen))

        // Send is async, but we return 0 immediately and let it complete
        socketManager.send(socketId, data, address, port).catch(err => {
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
    sk_udp_recv: (socketId: number, bufPtr: number, bufMaxLen: number, addrOutPtr: number, portOutPtr: number): number => {
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
    }
  }

  return envImports
}
