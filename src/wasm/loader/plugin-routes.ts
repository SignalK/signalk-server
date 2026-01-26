/**
 * WASM Plugin HTTP Route Handlers
 *
 * Handles HTTP route registration and request handling for WASM plugins.
 * Includes custom endpoint routing, log streaming, and basic REST API endpoints.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as express from 'express'
import type { Request, Response } from 'express'
import { spawn } from 'child_process'
import * as readline from 'readline'
import Debug from 'debug'
import { WasmPlugin } from './types'
import { SignalKApp, WasmRawExports } from '../types'
import { getWasmRuntime } from '../wasm-runtime'
import { getPluginStoragePaths, readPluginConfig } from '../wasm-storage'
import { SERVERROUTESPREFIX } from '../../constants'

const debug = Debug('signalk:wasm:loader')

/**
 * Helper to support both prefixed and non-prefixed routes
 */
export function backwardsCompat(url: string) {
  return [`${SERVERROUTESPREFIX}${url}`, url]
}

/**
 * Handle /api/logs request directly in Node.js (for signalk-logviewer plugin)
 * This avoids WASM memory buffer limitations (~64KB) when streaming large logs
 */
export async function handleLogViewerRequest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const lines = parseInt(req.query.lines as string) || 2000
    const maxLines = Math.min(lines, 50000) // Cap at 50000 lines

    debug(`[logviewer] Fetching ${maxLines} log lines via Node.js streaming`)

    // Try journalctl first
    const p = spawn('journalctl', [
      '-u',
      'signalk',
      '-n',
      maxLines.toString(),
      '--output=short-iso',
      '--no-pager'
    ])

    const logLines: string[] = []
    let hasError = false

    // Stream lines using readline
    const rl = readline.createInterface({
      input: p.stdout,
      crlfDelay: Infinity
    })

    rl.on('line', (line) => {
      if (line.trim().length > 0) {
        logLines.push(line)
      }
    })

    p.stderr.on('data', () => {
      // Errors are logged when journalctl exits with non-zero code
    })

    p.on('error', (err) => {
      debug(`[logviewer] journalctl spawn error: ${err.message}`)
      hasError = true
    })

    // Wait for process to complete
    await new Promise<void>((resolve) => {
      p.on('close', (code) => {
        debug(`[logviewer] journalctl exited with code ${code}`)
        if (code !== 0) {
          hasError = true
        }
        resolve()
      })
    })

    if (hasError || logLines.length === 0) {
      debug(`[logviewer] journalctl failed, trying file-based logs`)

      // Fallback to reading from file
      try {
        const tailP = spawn('tail', [
          '-n',
          maxLines.toString(),
          '/var/log/syslog'
        ])
        logLines.length = 0 // Clear array

        const tailRl = readline.createInterface({
          input: tailP.stdout,
          crlfDelay: Infinity
        })

        tailRl.on('line', (line) => {
          if (line.trim().length > 0) {
            logLines.push(line)
          }
        })

        await new Promise<void>((resolve) => {
          tailP.on('close', () => resolve())
        })
      } catch (tailErr) {
        debug(`[logviewer] tail also failed: ${tailErr}`)
      }
    }

    if (logLines.length === 0) {
      res.status(404).json({
        error: 'Could not find logs',
        message: 'Tried journalctl and file-based logs'
      })
      return
    }

    debug(
      `[logviewer] Retrieved ${logLines.length} log lines, sending response`
    )

    // Send response
    res.json({
      lines: logLines,
      count: logLines.length,
      source: 'journalctl',
      format: 'short-iso'
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`[logviewer] Error handling request: ${errorMsg}`)
    res.status(500).json({ error: errorMsg })
  }
}

/**
 * Add plugin-specific HTTP endpoints to an existing router
 * This is called when enabling a previously disabled plugin
 */
export function setupPluginSpecificRoutes(plugin: WasmPlugin): void {
  if (!plugin.router) {
    debug(
      `Warning: Cannot setup plugin-specific routes - no router found for ${plugin.id}`
    )
    return
  }

  if (!plugin.instance) {
    debug(`No instance for ${plugin.id}`)
    return
  }

  // Check for http_endpoints in either AssemblyScript loader or raw WASM exports
  const hasAsEndpoints =
    plugin.instance.asLoader &&
    typeof plugin.instance.asLoader.exports.http_endpoints === 'function'
  const hasRustEndpoints =
    plugin.instance.instance &&
    typeof (
      plugin.instance.instance.exports as WasmRawExports & WebAssembly.Exports
    ).http_endpoints === 'function'

  if (!hasAsEndpoints && !hasRustEndpoints) {
    debug(`No custom HTTP endpoints for ${plugin.id}`)
    return
  }

  const router = plugin.router

  // Register custom HTTP endpoints
  try {
    let endpointsJson: string

    // Check if this is an AssemblyScript or Rust plugin
    const asLoader = plugin.instance.asLoader
    if (asLoader && typeof asLoader.exports.http_endpoints === 'function') {
      // AssemblyScript: http_endpoints() returns a string pointer
      const ptr = asLoader.exports.http_endpoints()
      endpointsJson = asLoader.exports.__getString(ptr)
      debug(
        `Got http_endpoints from AssemblyScript: ${endpointsJson.substring(0, 200)}`
      )
    } else {
      // Rust: http_endpoints(out_ptr, out_max_len) -> written_len
      const rawExports = plugin.instance.instance.exports as WasmRawExports &
        WebAssembly.Exports
      if (
        typeof rawExports.allocate === 'function' &&
        typeof rawExports.http_endpoints === 'function'
      ) {
        const maxLen = 8192 // 8KB should be plenty for endpoint definitions
        const outPtr = rawExports.allocate(maxLen)
        const writtenLen = rawExports.http_endpoints(outPtr, maxLen)

        // Read the string from WASM memory
        const memory = rawExports.memory as WebAssembly.Memory
        const bytes = new Uint8Array(memory.buffer, outPtr, writtenLen)
        endpointsJson = new TextDecoder('utf-8').decode(bytes)

        // Deallocate
        if (typeof rawExports.deallocate === 'function') {
          rawExports.deallocate(outPtr, maxLen)
        }
        debug(
          `Got http_endpoints from Rust (${writtenLen} bytes): ${endpointsJson.substring(0, 200)}`
        )
      } else {
        debug(
          `http_endpoints export exists but plugin type unknown for ${plugin.id}`
        )
        return
      }
    }

    const endpoints = JSON.parse(endpointsJson)
    debug(`Registering ${endpoints.length} HTTP endpoints for ${plugin.id}`)

    for (const endpoint of endpoints) {
      const { method, path: endpointPath, handler } = endpoint
      const routeMethod = method.toLowerCase() as
        | 'get'
        | 'post'
        | 'put'
        | 'delete'

      if (!['get', 'post', 'put', 'delete'].includes(routeMethod)) {
        debug(`Skipping unsupported method: ${method}`)
        continue
      }

      debug(`Registering ${method} ${endpointPath} -> ${handler}`)

      router[routeMethod](endpointPath, async (req: Request, res: Response) => {
        // Set a timeout to catch hangs (declare outside try so catch can access it)
        let timeout: NodeJS.Timeout | null = null

        try {
          debug(
            `HTTP ${method} ${endpointPath} called - req.path: ${req.path}, req.url: ${req.url}`
          )

          // SPECIAL CASE: Handle /api/logs directly in Node.js for signalk-logviewer
          // WASM cannot handle large data streams due to memory buffer limitations (~64KB)
          if (
            plugin.id === 'signalk-logviewer' &&
            endpointPath === '/api/logs' &&
            method === 'GET'
          ) {
            debug(`Intercepting /api/logs for logviewer - handling in Node.js`)
            return handleLogViewerRequest(req, res)
          }

          // Build request context for WASM plugin
          const requestContext = JSON.stringify({
            method: req.method,
            path: req.path,
            query: req.query,
            params: req.params,
            body: req.body,
            headers: req.headers
          })

          debug(
            `Calling WASM handler ${handler} with context: ${requestContext.substring(0, 200)}`
          )

          // Use AssemblyScript loader if available (handles strings automatically)
          const asLoader = plugin.instance!.asLoader
          let responseJson: string

          // Set a timeout to catch hangs
          // Note: We cannot actually interrupt WASM execution, but we can detect hangs
          let handlerTimedOut = false
          timeout = setTimeout(() => {
            handlerTimedOut = true
            debug(
              `ERROR: Handler ${handler} exceeded 10 second timeout - responding with error`
            )
            debug(
              `WARNING: WASM execution cannot be interrupted, server may remain partially blocked`
            )
            // Send error response even though handler is still running
            if (!res.headersSent) {
              res.status(504).json({
                error: 'Plugin handler timeout',
                message:
                  'The WASM plugin took too long to respond. This indicates a performance issue in the plugin code.'
              })
            }
          }, 10000) // 10 second hard timeout

          if (asLoader) {
            // AssemblyScript plugin with loader - strings handled automatically!
            debug(`Using AssemblyScript loader for handler ${handler}`)

            const handlerFunc = asLoader.exports[handler]
            if (typeof handlerFunc !== 'function') {
              debug(`Handler function ${handler} not found in WASM exports`)
              if (timeout) clearTimeout(timeout)
              return res
                .status(500)
                .json({ error: `Handler function ${handler} not found` })
            }

            // Create an AssemblyScript string in WASM memory using __newString
            const requestPtr = asLoader.exports.__newString(requestContext)
            const requestLen = requestContext.length

            debug(
              `Calling handler with string ptr=${requestPtr}, len=${requestLen}`
            )

            // Call handler - it returns an AssemblyScript string pointer
            let asStringPtr: number
            try {
              debug(`About to call handler function...`)
              asStringPtr = handlerFunc(requestPtr, requestLen)
              debug(
                `Handler function call completed, returned pointer: ${asStringPtr}`
              )
            } catch (handlerError) {
              const handlerErrMsg =
                handlerError instanceof Error
                  ? handlerError.message
                  : String(handlerError)
              debug(`ERROR: Handler function threw exception: ${handlerErrMsg}`)
              debug(
                `Stack: ${handlerError instanceof Error ? handlerError.stack : 'N/A'}`
              )
              throw new Error(`WASM handler crashed: ${handlerErrMsg}`)
            }

            // Check if we already sent timeout response
            if (handlerTimedOut) {
              debug(`Handler completed after timeout - discarding result`)
              return
            }

            // Use __getString to decode the AssemblyScript string
            try {
              debug(`About to decode string from pointer ${asStringPtr}...`)
              responseJson = asLoader.exports.__getString(asStringPtr)
              debug(
                `String decoded successfully, length: ${responseJson.length}`
              )
              debug(
                `WASM handler returned (via loader): ${responseJson.substring(0, 500)}`
              )
            } catch (decodeError) {
              const decodeErrMsg =
                decodeError instanceof Error
                  ? decodeError.message
                  : String(decodeError)
              debug(`ERROR: Failed to decode response string: ${decodeErrMsg}`)
              throw new Error(`Failed to decode WASM response: ${decodeErrMsg}`)
            }
          } else {
            // Rust plugins use buffer-based string passing
            debug(
              `Using raw exports for handler ${handler} (Rust buffer-based)`
            )
            const rawExports = plugin.instance!.instance
              .exports as WasmRawExports & WebAssembly.Exports
            const handlerFunc = rawExports[handler]

            if (typeof handlerFunc !== 'function') {
              debug(`Handler function ${handler} not found in WASM exports`)
              if (timeout) clearTimeout(timeout)
              return res
                .status(500)
                .json({ error: `Handler function ${handler} not found` })
            }

            // Check if this is a Rust plugin with allocate/deallocate
            if (typeof rawExports.allocate === 'function') {
              // Rust buffer-based string passing (same pattern as PUT handlers)
              const requestBytes = Buffer.from(requestContext, 'utf8')
              const requestPtr = rawExports.allocate(requestBytes.length)
              const responseMaxLen = 65536 // 64KB response buffer
              const responsePtr = rawExports.allocate(responseMaxLen)

              // Write request to WASM memory
              const memory = rawExports.memory as WebAssembly.Memory
              const memView = new Uint8Array(memory.buffer)
              memView.set(requestBytes, requestPtr)

              // Call handler: (request_ptr, request_len, response_ptr, response_max_len) -> written_len
              const writtenLen = handlerFunc(
                requestPtr,
                requestBytes.length,
                responsePtr,
                responseMaxLen
              )

              // Read response from WASM memory
              const responseBytes = new Uint8Array(
                memory.buffer,
                responsePtr,
                writtenLen
              )
              responseJson = new TextDecoder('utf-8').decode(responseBytes)

              // Deallocate buffers
              if (typeof rawExports.deallocate === 'function') {
                rawExports.deallocate(requestPtr, requestBytes.length)
                rawExports.deallocate(responsePtr, responseMaxLen)
              }

              debug(
                `Rust handler returned ${writtenLen} bytes: ${responseJson.substring(0, 200)}`
              )
            } else {
              // Fallback for unknown plugin types - try direct call
              responseJson = handlerFunc(requestContext)
            }
          }

          const response = JSON.parse(responseJson)

          // Set status code and headers
          res.status(response.statusCode || 200)
          if (response.headers) {
            Object.entries(response.headers).forEach(([key, value]) => {
              res.setHeader(key, value as string)
            })
          }

          // Send body - try to parse as JSON if it's a string, otherwise send as-is
          let body = response.body
          if (typeof body === 'string') {
            // Check if Content-Type is JSON
            const contentType = response.headers?.['Content-Type'] || ''
            if (contentType.includes('application/json')) {
              try {
                // Try to parse the string as JSON - if it's double-escaped, this will fix it
                body = JSON.parse(body)
              } catch (e) {
                // If parsing fails, send the string as-is (might be plain text)
                debug(
                  `Warning: Could not parse body as JSON, sending as string: ${e}`
                )
              }
            }
          }

          if (timeout) clearTimeout(timeout)
          debug(`Handler completed successfully, sending response`)
          res.send(body)
        } catch (error) {
          if (timeout) clearTimeout(timeout)
          const errorMsg =
            error instanceof Error ? error.message : String(error)
          const stack = error instanceof Error ? error.stack : 'N/A'
          debug(`Error in HTTP endpoint ${method} ${endpointPath}: ${errorMsg}`)
          debug(`Stack trace: ${stack}`)
          res.status(500).json({ error: errorMsg })
        }
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Failed to register HTTP endpoints: ${errorMsg}`)
  }

  debug(`Added plugin-specific routes for ${plugin.id}`)
}

/**
 * Set up REST API routes for a WASM plugin
 */
export function setupWasmPluginRoutes(
  app: SignalKApp,
  plugin: WasmPlugin,
  configPath: string,
  updateWasmPluginConfig: (
    app: SignalKApp,
    pluginId: string,
    configuration: unknown,
    configPath: string
  ) => Promise<void>,
  startWasmPlugin: (app: SignalKApp, pluginId: string) => Promise<void>,
  stopWasmPlugin: (pluginId: string) => Promise<void>
): void {
  const router = express.Router()

  // GET /plugins/:id - Get plugin info
  router.get('/', (req: Request, res: Response) => {
    void req // Required by Express signature
    res.json({
      enabled: plugin.enabled,
      enabledByDefault: false,
      id: plugin.id,
      name: plugin.name,
      version: plugin.version
    })
  })

  // POST /plugins/:id/config - Save plugin configuration
  router.post('/config', async (req: Request, res: Response) => {
    try {
      debug(`POST /config received for WASM plugin: ${plugin.id}`)
      debug(`Request body: ${JSON.stringify(req.body)}`)

      const newConfig = req.body

      debug(
        `Current plugin state - enabled: ${plugin.enabled}, enableDebug: ${plugin.enableDebug}, configuration: ${JSON.stringify(plugin.configuration)}`
      )

      // Update enableDebug FIRST (before saving config)
      if (typeof newConfig.enableDebug === 'boolean') {
        debug(
          `Updating enableDebug from ${plugin.enableDebug} to ${newConfig.enableDebug}`
        )
        plugin.enableDebug = newConfig.enableDebug
      }

      // Update enabled state SECOND (before saving config)
      const enabledChanged =
        typeof newConfig.enabled === 'boolean' &&
        newConfig.enabled !== plugin.enabled
      if (enabledChanged) {
        debug(`Updating enabled from ${plugin.enabled} to ${newConfig.enabled}`)
        plugin.enabled = newConfig.enabled
      }

      // Update plugin configuration and save everything to disk
      debug(
        `Calling updateWasmPluginConfig with: ${JSON.stringify(newConfig.configuration)}`
      )
      await updateWasmPluginConfig(
        app,
        plugin.id,
        newConfig.configuration,
        configPath
      )
      debug(`updateWasmPluginConfig completed`)

      // Start or stop plugin if enabled state changed
      if (enabledChanged) {
        if (plugin.enabled && plugin.status !== 'running') {
          // If plugin was disabled at startup, instance will be null - need to load it first
          if (!plugin.instance) {
            debug(`Plugin was disabled at startup, loading WASM binary now...`)

            // Read package.json to get WASM path
            const packageJsonPath = path.join(
              plugin.packageLocation,
              plugin.packageName,
              'package.json'
            )
            const packageJson = JSON.parse(
              fs.readFileSync(packageJsonPath, 'utf-8')
            ) as { wasmManifest: string }
            const wasmPath = path.join(
              plugin.packageLocation,
              plugin.packageName,
              packageJson.wasmManifest
            )
            const capabilities = plugin.metadata.capabilities

            // Create VFS root
            const storagePaths = getPluginStoragePaths(
              configPath,
              plugin.id,
              plugin.packageName
            )

            // Load WASM module
            const runtime = getWasmRuntime()
            const instance = await runtime.loadPlugin(
              plugin.packageName,
              wasmPath,
              storagePaths.vfsRoot,
              capabilities,
              app
            )

            plugin.instance = instance

            // Get plugin metadata from WASM exports
            const pluginName = instance.exports.name()
            const schemaJson = instance.exports.schema()
            const schema = schemaJson ? JSON.parse(schemaJson) : {}

            plugin.name = pluginName
            plugin.schema = schema

            // Add plugin-specific HTTP endpoints to existing router
            // (basic routes were already set up when plugin was registered as disabled)
            setupPluginSpecificRoutes(plugin)

            debug(`Successfully loaded WASM binary for ${plugin.id}`)
          }

          debug(`Plugin enabled, starting...`)
          await startWasmPlugin(app, plugin.id)
        } else if (!plugin.enabled && plugin.status === 'running') {
          debug(`Plugin disabled, stopping...`)
          await stopWasmPlugin(plugin.id)
        }
      }

      debug(
        `Final plugin state - enabled: ${plugin.enabled}, status: ${plugin.status}`
      )

      const response = `Saved configuration for plugin ${plugin.id}`
      debug(`Sending response: ${response}`)
      res.json(response)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : ''
      debug(`ERROR saving WASM plugin config: ${errorMsg}`)
      debug(`Stack trace: ${stack}`)
      console.error(`Error saving WASM plugin config:`, error)
      res.status(500).json({ error: errorMsg })
    }
  })

  // GET /plugins/:id/config - Get plugin configuration
  router.get('/config', (req: Request, res: Response) => {
    void req // Required by Express signature
    const storagePaths = getPluginStoragePaths(
      configPath,
      plugin.id,
      plugin.packageName
    )
    const config = readPluginConfig(storagePaths.configFile)

    res.json({
      enabled: plugin.enabled,
      enableDebug: plugin.enableDebug,
      configuration: plugin.configuration,
      ...config
    })
  })

  // Register the router for this plugin
  if (app.use) {
    app.use(backwardsCompat(`/plugins/${plugin.id}`), router)
  }

  // Store router in plugin object for later removal
  plugin.router = router

  // Register custom HTTP endpoints if plugin instance is loaded
  setupPluginSpecificRoutes(plugin)

  debug(`Set up REST API routes for WASM plugin: ${plugin.id}`)
}
