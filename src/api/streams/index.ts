/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Binary Stream WebSocket Endpoints
 *
 * Provides WebSocket endpoints for high-frequency binary data streaming
 * from WASM plugins (radar spokes, AIS targets, etc.)
 */

import Debug from 'debug'
import WebSocket from 'ws'
import { IncomingMessage } from 'http'
import { binaryStreamManager } from './binary-stream-manager'

const debug = Debug('signalk:streams')

interface StreamApplication {
  server: any
  securityStrategy: {
    shouldAllowWrite: (request: any, requestType: string) => boolean
    authorizeWS?: (request: any) => void
  }
}

/**
 * Initialize binary stream WebSocket endpoints
 *
 * @param app - SignalK application instance
 */
export function initializeBinaryStreams(app: StreamApplication): void {
  console.log(
    '[signalk:streams] initializeBinaryStreams called, app.server exists:',
    !!app.server
  )
  if (!app.server) {
    debug('HTTP server not available, skipping binary stream initialization')
    console.log(
      '[signalk:streams] HTTP server not available, skipping binary stream initialization'
    )
    return
  }

  debug('Initializing binary stream WebSocket endpoints')
  console.log('[signalk:streams] Registering upgrade handler on server')

  // Handle WebSocket upgrade requests for binary streams
  // Note: This listener is added to app.server which should be an HTTP server
  console.log('[signalk:streams] Adding upgrade listener to server')
  app.server.on(
    'upgrade',
    (request: IncomingMessage, socket: any, head: Buffer) => {
      console.log(
        `[signalk:streams] Upgrade request received: ${request.url}, headers.host: ${request.headers.host}`
      )
      try {
        const url = new URL(request.url!, `http://${request.headers.host}`)
        const pathname = url.pathname
        console.log(`[signalk:streams] Pathname: ${pathname}`)

        // Match: /signalk/v2/api/streams/:streamId (support path segments in streamId)
        const streamMatch = pathname.match(
          /^\/signalk\/v2\/api\/streams\/(.+)$/
        )

        // Match: /signalk/v2/api/vessels/self/radars/:id/stream (convenience alias)
        const radarMatch = pathname.match(
          /^\/signalk\/v2\/api\/vessels\/self\/radars\/([^\/]+)\/stream$/
        )

        let streamId: string | null = null

        if (streamMatch) {
          streamId = decodeURIComponent(streamMatch[1])
          console.log(`[signalk:streams] Matched stream pattern: ${streamId}`)
        } else if (radarMatch) {
          // Alias: map radar endpoint to radars/{radarId} stream
          const radarId = radarMatch[1]
          streamId = `radars/${radarId}`
          console.log(
            `[signalk:streams] Matched radar stream pattern: ${streamId}`
          )
        } else {
          // Not a binary stream endpoint, let other handlers process
          console.log(
            `[signalk:streams] No match for path, ignoring: ${pathname}`
          )
          return
        }

        debug(`WebSocket upgrade request for stream: ${streamId}`)
        console.log(
          `[signalk:streams] Processing WebSocket upgrade for stream: ${streamId}`
        )

        // Authenticate the request (if security is enabled)
        let principal: any = null

        // Check if security is enabled
        if (
          app.securityStrategy &&
          typeof app.securityStrategy.shouldAllowWrite === 'function'
        ) {
          try {
            // Security is enabled, perform authentication
            if (app.securityStrategy.authorizeWS) {
              app.securityStrategy.authorizeWS(request)
              principal = (request as any).skPrincipal
            } else {
              // Fallback: use shouldAllowWrite for basic auth check
              if (!app.securityStrategy.shouldAllowWrite(request, 'streams')) {
                throw new Error('Unauthorized')
              }
              principal = (request as any).skPrincipal || {
                identifier: 'unknown'
              }
            }
          } catch (error) {
            debug(`Authentication failed for stream ${streamId}: ${error}`)
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
        } else {
          // Security is disabled, allow connection without authentication
          debug(
            `Security disabled, allowing unauthenticated connection to stream: ${streamId}`
          )
          principal = { identifier: 'unauthenticated' }
        }

        // Create WebSocket connection
        console.log(
          `[signalk:streams] Creating WebSocket server for stream: ${streamId}`
        )
        const wss = new WebSocket.Server({ noServer: true })
        wss.handleUpgrade(request, socket, head, (ws) => {
          debug(`WebSocket connected to stream: ${streamId}`)
          console.log(
            `[signalk:streams] WebSocket connected to stream: ${streamId}`
          )

          // Register client with stream manager
          binaryStreamManager.addClient(streamId!, ws, principal)

          ws.on('close', () => {
            debug(`WebSocket disconnected from stream: ${streamId}`)
            binaryStreamManager.removeClient(streamId!, ws)
          })

          ws.on('error', (err: Error) => {
            debug(`WebSocket error for stream ${streamId}: ${err}`)
            binaryStreamManager.removeClient(streamId!, ws)
          })

          // Binary streams are one-way (server → client), ignore client messages
          ws.on('message', () => {
            debug(`Ignoring message from client on binary stream ${streamId}`)
          })
        })
      } catch (error) {
        debug(`Error handling WebSocket upgrade: ${error}`)
        console.error('[signalk:streams] WebSocket upgrade error:', error)
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
        socket.destroy()
      }
    }
  )

  debug('Binary stream WebSocket endpoints initialized')
}

// Export stream manager for use by FFI bindings
export { binaryStreamManager }
