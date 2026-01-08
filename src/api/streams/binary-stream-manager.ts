/**
 * Binary Stream Manager
 *
 * Manages WebSocket streaming of high-frequency binary data from WASM plugins.
 * Handles buffering, client connections, and slow consumer disconnection.
 */

import Debug from 'debug'
import type { WebSocket } from 'ws'

const debug = Debug('signalk:streams:binary-stream-manager')

/**
 * Maximum buffer size per WebSocket before considering client too slow
 */
const MAX_WEBSOCKET_BUFFER_SIZE = 256 * 1024 // 256KB

/**
 * Maximum consecutive drops before disconnecting slow client
 */
const MAX_CONSECUTIVE_DROPS = 30 // ~0.5 seconds at 60Hz

/**
 * Maximum frames buffered per stream (ring buffer)
 */
const MAX_BUFFERED_FRAMES = 100

/**
 * Security principal representing the authenticated user/device
 */
export interface StreamPrincipal {
  identifier: string
}

/**
 * Client connected to a binary stream
 */
interface StreamClient {
  streamId: string
  ws: WebSocket
  principal: StreamPrincipal
  consecutiveDropCount: number
  connectedAt: number
}

/**
 * Manages binary data streaming to WebSocket clients
 */
export class BinaryStreamManager {
  private clients: Map<string, Set<StreamClient>> = new Map()
  private buffers: Map<string, Buffer[]> = new Map()

  /**
   * Emit binary data to all clients subscribed to a stream
   * Called by WASM plugins via FFI binding
   *
   * @param streamId - Stream identifier (e.g., "radars/radar-0")
   * @param data - Binary data to send
   */
  private emitCount: number = 0

  emitData(streamId: string, data: Buffer): void {
    this.emitCount++
    // Log periodically
    if (this.emitCount % 500 === 0) {
      const clients = this.clients.get(streamId)
      debug(
        'emitData #%d: streamId=%s, dataLen=%d, clients=%d',
        this.emitCount,
        streamId,
        data.length,
        clients?.size || 0
      )
    }

    // Add to ring buffer
    let buffer = this.buffers.get(streamId)
    if (!buffer) {
      buffer = []
      this.buffers.set(streamId, buffer)
    }

    buffer.push(data)

    // Maintain ring buffer size
    if (buffer.length > MAX_BUFFERED_FRAMES) {
      buffer.shift() // Remove oldest frame
    }

    // Send to all connected clients
    const clients = this.clients.get(streamId)
    if (!clients || clients.size === 0) {
      return // No clients, buffered for later
    }

    for (const client of clients) {
      this.sendToClient(client, data)
    }
  }

  /**
   * Add a WebSocket client to a stream
   *
   * @param streamId - Stream identifier
   * @param ws - WebSocket connection
   * @param principal - Security principal (authenticated user)
   */
  addClient(streamId: string, ws: WebSocket, principal: StreamPrincipal): void {
    debug('Adding client to stream: %s', streamId)

    const client: StreamClient = {
      streamId,
      ws,
      principal,
      consecutiveDropCount: 0,
      connectedAt: Date.now()
    }

    // Add to clients map
    let clients = this.clients.get(streamId)
    if (!clients) {
      clients = new Set()
      this.clients.set(streamId, clients)
    }
    clients.add(client)

    // Note: We intentionally do NOT send buffered frames to new clients.
    // For high-frequency streams like radar, sending 100 buffered frames
    // at once overwhelms the client's WebSocket buffer, triggering
    // backpressure disconnection. Fresh data will arrive immediately anyway.

    debug(`Stream ${streamId} now has ${clients.size} client(s)`)
  }

  /**
   * Remove a WebSocket client from a stream
   *
   * @param streamId - Stream identifier
   * @param ws - WebSocket connection to remove
   */
  removeClient(streamId: string, ws: WebSocket): void {
    const clients = this.clients.get(streamId)
    if (!clients) {
      return
    }

    // Find and remove client
    for (const client of clients) {
      if (client.ws === ws) {
        clients.delete(client)
        debug(
          'Removed client from stream: %s, remaining: %d',
          streamId,
          clients.size
        )
        break
      }
    }

    // Clean up empty client sets
    if (clients.size === 0) {
      this.clients.delete(streamId)
      debug(`Stream ${streamId} has no more clients`)
    }
  }

  /**
   * Clean up all clients and buffers for a stream
   * Called when plugin stops
   *
   * @param streamId - Stream identifier
   */
  cleanupStream(streamId: string): void {
    const clients = this.clients.get(streamId)
    if (clients) {
      for (const client of clients) {
        try {
          client.ws.close(1001, 'Stream ended')
        } catch (error) {
          debug(`Error closing client WebSocket: ${error}`)
        }
      }
      this.clients.delete(streamId)
    }

    this.buffers.delete(streamId)
    debug(`Cleaned up stream: ${streamId}`)
  }

  /**
   * Send binary data to a specific client, disconnecting slow consumers
   *
   * @param client - Client to send to
   * @param data - Binary data
   */
  private sendToClient(client: StreamClient, data: Buffer): void {
    // Check if client buffer is full (slow consumer)
    if (client.ws.bufferedAmount > MAX_WEBSOCKET_BUFFER_SIZE) {
      client.consecutiveDropCount++

      if (client.consecutiveDropCount > MAX_CONSECUTIVE_DROPS) {
        debug(
          `Disconnecting slow client on stream ${client.streamId} ` +
            `(dropped ${client.consecutiveDropCount} frames)`
        )
        try {
          client.ws.close(1008, 'Client cannot keep up with data rate')
        } catch (error) {
          debug(`Error closing slow client: ${error}`)
        }

        // Remove from clients set
        const clients = this.clients.get(client.streamId)
        if (clients) {
          clients.delete(client)
        }
      }

      // Skip sending this frame
      return
    }

    // Reset drop counter on successful send
    client.consecutiveDropCount = 0

    // Send binary frame
    try {
      client.ws.send(data, { binary: true })
    } catch (error) {
      debug(`Error sending to client on stream ${client.streamId}: ${error}`)
    }
  }

  /**
   * Get number of buffered frames for a stream (for testing)
   *
   * @param streamId - Stream identifier
   * @returns Number of buffered frames
   */
  getBufferSize(streamId: string): number {
    const buffer = this.buffers.get(streamId)
    return buffer ? buffer.length : 0
  }

  /**
   * Get number of connected clients for a stream (for testing)
   *
   * @param streamId - Stream identifier
   * @returns Number of connected clients
   */
  getClientCount(streamId: string): number {
    const clients = this.clients.get(streamId)
    return clients ? clients.size : 0
  }
}

// Export singleton instance
export const binaryStreamManager = new BinaryStreamManager()
