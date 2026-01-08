/**
 * Binary Stream WebSocket Endpoints
 *
 * Provides WebSocket endpoints for high-frequency binary data streaming
 * from WASM plugins (radar spokes, AIS targets, etc.)
 */

import Debug from 'debug'
import WebSocket from 'ws'
import { IncomingMessage } from 'http'
import { Duplex } from 'stream'
import { Server as HttpServer } from 'http'
import { Server as HttpsServer } from 'https'
import { SecurityStrategy, WithSecurityStrategy } from '../../security'
import { binaryStreamManager, StreamPrincipal } from './binary-stream-manager'

const debug = Debug('signalk:streams')

/**
 * Extended security strategy with WebSocket authentication methods.
 * These methods are implemented by tokensecurity.js and dummysecurity.ts
 * but not declared in the base SecurityStrategy interface.
 */
interface WebSocketSecurityStrategy extends SecurityStrategy {
  shouldAllowWrite?: (request: IncomingMessage, requestType: string) => boolean
  authorizeWS?: (request: IncomingMessage) => void
}

/**
 * Application with HTTP server for WebSocket upgrades
 */
interface WithServer {
  server: HttpServer | HttpsServer | null
}

/**
 * Application interface for binary stream initialization
 */
interface StreamApplication
  extends WithServer, Omit<WithSecurityStrategy, 'securityStrategy'> {
  securityStrategy: WebSocketSecurityStrategy
}

/**
 * Extended request with SignalK principal attached by security middleware
 */
interface AuthenticatedRequest extends IncomingMessage {
  skPrincipal?: StreamPrincipal
}

/**
 * Initialize binary stream WebSocket endpoints
 *
 * @param app - SignalK application instance
 */
export function initializeBinaryStreams(app: StreamApplication): void {
  debug('initializeBinaryStreams called, app.server exists: %s', !!app.server)
  if (!app.server) {
    debug('HTTP server not available, skipping binary stream initialization')
    return
  }

  debug('Initializing binary stream WebSocket endpoints')

  // Handle WebSocket upgrade requests for binary streams
  // Note: This listener is added to app.server which should be an HTTP server
  debug('Adding upgrade listener to server')
  app.server.on(
    'upgrade',
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      debug(
        'Upgrade request received: %s, headers.host: %s',
        request.url,
        request.headers.host
      )
      try {
        const url = new URL(request.url!, `http://${request.headers.host}`)
        const pathname = url.pathname
        debug('Pathname: %s', pathname)

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
          debug('Matched stream pattern: %s', streamId)
        } else if (radarMatch) {
          // Alias: map radar endpoint to radars/{radarId} stream
          const radarId = radarMatch[1]
          streamId = `radars/${radarId}`
          debug('Matched radar stream pattern: %s', streamId)
        } else {
          // Not a binary stream endpoint, let other handlers process
          debug('No match for path, ignoring: %s', pathname)
          return
        }

        debug('Processing WebSocket upgrade for stream: %s', streamId)

        // Authenticate the request (if security is enabled)
        let principal: StreamPrincipal = { identifier: 'unknown' }
        const authRequest = request as AuthenticatedRequest

        // Check if security is enabled
        if (
          app.securityStrategy &&
          typeof app.securityStrategy.shouldAllowWrite === 'function'
        ) {
          try {
            // Security is enabled, perform authentication
            if (app.securityStrategy.authorizeWS) {
              app.securityStrategy.authorizeWS(request)
              principal = authRequest.skPrincipal || { identifier: 'unknown' }
            } else {
              // Fallback: use shouldAllowWrite for basic auth check
              if (!app.securityStrategy.shouldAllowWrite(request, 'streams')) {
                throw new Error('Unauthorized')
              }
              principal = authRequest.skPrincipal || { identifier: 'unknown' }
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
        debug('Creating WebSocket server for stream: %s', streamId)
        const wss = new WebSocket.Server({ noServer: true })
        wss.handleUpgrade(request, socket, head, (ws) => {
          debug('WebSocket connected to stream: %s', streamId)

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
