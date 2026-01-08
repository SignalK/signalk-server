/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WASM Socket Manager
 *
 * Manages UDP and TCP sockets for WASM plugins that need raw network access
 * (e.g., radar plugins, NMEA receivers, etc.)
 *
 * Uses Node.js dgram and net modules, bridged to WASM via FFI
 */

import * as dgram from 'dgram'
import * as net from 'net'
import Debug from 'debug'

const debug = Debug('signalk:wasm:sockets')

/**
 * Buffered datagram for non-blocking receive
 */
interface BufferedDatagram {
  data: Buffer
  address: string
  port: number
  timestamp: number
}

/**
 * Pending socket option to apply after bind
 */
interface PendingOption {
  type:
    | 'broadcast'
    | 'multicastTTL'
    | 'multicastLoopback'
    | 'joinMulticast'
    | 'leaveMulticast'
  value:
    | boolean
    | number
    | { multicastAddress: string; interfaceAddress?: string }
}

/**
 * Managed UDP socket with receive buffer
 */
interface ManagedSocket {
  socket: dgram.Socket
  pluginId: string
  bound: boolean
  bindPromise: Promise<number> | null
  receiveBuffer: BufferedDatagram[]
  maxBufferSize: number
  multicastGroups: Set<string>
  pendingOptions: PendingOption[]
}

/**
 * Socket Manager - singleton for managing plugin sockets
 */
class SocketManager {
  private sockets: Map<number, ManagedSocket> = new Map()
  private nextSocketId: number = 1

  /**
   * Create a new UDP socket
   * @param pluginId - Plugin that owns the socket
   * @param type - Socket type: 'udp4' or 'udp6'
   * @returns Socket ID, or -1 on error
   */
  createSocket(pluginId: string, type: 'udp4' | 'udp6' = 'udp4'): number {
    try {
      const socketId = this.nextSocketId++
      const socket = dgram.createSocket({
        type,
        reuseAddr: true // Allow multiple plugins to bind to same port
      })

      const managed: ManagedSocket = {
        socket,
        pluginId,
        bound: false,
        bindPromise: null,
        receiveBuffer: [],
        maxBufferSize: 1000, // Max buffered datagrams
        multicastGroups: new Set(),
        pendingOptions: []
      }

      // Set up message handler to buffer incoming data
      socket.on('message', (msg, rinfo) => {
        if (managed.receiveBuffer.length >= managed.maxBufferSize) {
          // Drop oldest message if buffer full
          managed.receiveBuffer.shift()
        }
        managed.receiveBuffer.push({
          data: Buffer.from(msg), // Copy the buffer
          address: rinfo.address,
          port: rinfo.port,
          timestamp: Date.now()
        })
      })

      socket.on('error', (err) => {
        debug(`[${pluginId}] Socket ${socketId} error: ${err.message}`)
      })

      socket.on('close', () => {
        debug(`[${pluginId}] Socket ${socketId} closed`)
        this.sockets.delete(socketId)
      })

      this.sockets.set(socketId, managed)
      debug(`[${pluginId}] Created socket ${socketId} (${type})`)
      return socketId
    } catch (error) {
      debug(`Failed to create socket: ${error}`)
      return -1
    }
  }

  /**
   * Bind socket to a port
   * @param socketId - Socket to bind
   * @param port - Port number (0 for any available port)
   * @param address - Address to bind to (optional, defaults to all interfaces)
   * @returns 0 on success, -1 on error
   */
  bind(socketId: number, port: number, address?: string): Promise<number> {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`Socket ${socketId} not found`)
      return Promise.resolve(-1)
    }

    // Store the promise so setBroadcast etc. can wait for it
    managed.bindPromise = new Promise((resolve) => {
      try {
        managed.socket.bind(port, address, () => {
          managed.bound = true
          const addr = managed.socket.address()
          debug(
            `[${managed.pluginId}] Socket ${socketId} bound to ${addr.address}:${addr.port}`
          )

          // Apply any pending socket options now that we're bound
          for (const option of managed.pendingOptions) {
            try {
              if (option.type === 'broadcast') {
                managed.socket.setBroadcast(option.value as boolean)
                debug(
                  `[${managed.pluginId}] Applied deferred setBroadcast(${option.value})`
                )
              } else if (option.type === 'multicastTTL') {
                managed.socket.setMulticastTTL(option.value as number)
                debug(
                  `[${managed.pluginId}] Applied deferred setMulticastTTL(${option.value})`
                )
              } else if (option.type === 'multicastLoopback') {
                managed.socket.setMulticastLoopback(option.value as boolean)
                debug(
                  `[${managed.pluginId}] Applied deferred setMulticastLoopback(${option.value})`
                )
              } else if (option.type === 'joinMulticast') {
                const { multicastAddress, interfaceAddress } = option.value as {
                  multicastAddress: string
                  interfaceAddress?: string
                }
                if (interfaceAddress) {
                  managed.socket.addMembership(
                    multicastAddress,
                    interfaceAddress
                  )
                } else {
                  managed.socket.addMembership(multicastAddress)
                }
                managed.multicastGroups.add(multicastAddress)
                debug(
                  `[${managed.pluginId}] Applied deferred joinMulticast(${multicastAddress})`
                )
              } else if (option.type === 'leaveMulticast') {
                const { multicastAddress, interfaceAddress } = option.value as {
                  multicastAddress: string
                  interfaceAddress?: string
                }
                if (interfaceAddress) {
                  managed.socket.dropMembership(
                    multicastAddress,
                    interfaceAddress
                  )
                } else {
                  managed.socket.dropMembership(multicastAddress)
                }
                managed.multicastGroups.delete(multicastAddress)
                debug(
                  `[${managed.pluginId}] Applied deferred leaveMulticast(${multicastAddress})`
                )
              }
            } catch (optionError) {
              debug(
                `[${managed.pluginId}] Error applying deferred option ${option.type}: ${optionError}`
              )
            }
          }
          managed.pendingOptions = []

          resolve(0)
        })
      } catch (error) {
        debug(`[${managed.pluginId}] Bind error: ${error}`)
        resolve(-1)
      }
    })

    return managed.bindPromise
  }

  /**
   * Join a multicast group
   * @param socketId - Socket to use
   * @param multicastAddress - Multicast group address (e.g., "239.254.2.0")
   * @param interfaceAddress - Interface address to use (optional)
   * @returns 0 on success, -1 on error
   */
  joinMulticast(
    socketId: number,
    multicastAddress: string,
    interfaceAddress?: string
  ): number {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`Socket ${socketId} not found`)
      return -1
    }

    // If socket is not yet bound, defer the multicast join until bind completes
    if (!managed.bound) {
      debug(
        `[${managed.pluginId}] Deferring joinMulticast(${multicastAddress}) until socket is bound`
      )
      managed.pendingOptions.push({
        type: 'joinMulticast',
        value: { multicastAddress, interfaceAddress }
      })
      return 0
    }

    try {
      if (interfaceAddress) {
        managed.socket.addMembership(multicastAddress, interfaceAddress)
      } else {
        managed.socket.addMembership(multicastAddress)
      }
      managed.multicastGroups.add(multicastAddress)
      debug(
        `[${managed.pluginId}] Socket ${socketId} joined multicast ${multicastAddress}`
      )
      return 0
    } catch (error) {
      debug(`[${managed.pluginId}] Join multicast error: ${error}`)
      return -1
    }
  }

  /**
   * Leave a multicast group
   * @param socketId - Socket to use
   * @param multicastAddress - Multicast group address
   * @param interfaceAddress - Interface address (optional)
   * @returns 0 on success, -1 on error
   */
  leaveMulticast(
    socketId: number,
    multicastAddress: string,
    interfaceAddress?: string
  ): number {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`Socket ${socketId} not found`)
      return -1
    }

    // If socket is not yet bound, defer the multicast leave until bind completes
    if (!managed.bound) {
      debug(
        `[${managed.pluginId}] Deferring leaveMulticast(${multicastAddress}) until socket is bound`
      )
      managed.pendingOptions.push({
        type: 'leaveMulticast',
        value: { multicastAddress, interfaceAddress }
      })
      return 0
    }

    try {
      if (interfaceAddress) {
        managed.socket.dropMembership(multicastAddress, interfaceAddress)
      } else {
        managed.socket.dropMembership(multicastAddress)
      }
      managed.multicastGroups.delete(multicastAddress)
      debug(
        `[${managed.pluginId}] Socket ${socketId} left multicast ${multicastAddress}`
      )
      return 0
    } catch (error) {
      debug(`[${managed.pluginId}] Leave multicast error: ${error}`)
      return -1
    }
  }

  /**
   * Set socket options
   */
  setMulticastTTL(socketId: number, ttl: number): number {
    const managed = this.sockets.get(socketId)
    if (!managed) return -1

    // If socket is not yet bound, defer the option
    if (!managed.bound) {
      debug(
        `[${managed.pluginId}] Deferring setMulticastTTL(${ttl}) until socket is bound`
      )
      managed.pendingOptions.push({ type: 'multicastTTL', value: ttl })
      return 0
    }

    try {
      managed.socket.setMulticastTTL(ttl)
      return 0
    } catch (error) {
      debug(`[${managed.pluginId}] setMulticastTTL error: ${error}`)
      return -1
    }
  }

  setMulticastLoopback(socketId: number, enabled: boolean): number {
    const managed = this.sockets.get(socketId)
    if (!managed) return -1

    // If socket is not yet bound, defer the option
    if (!managed.bound) {
      debug(
        `[${managed.pluginId}] Deferring setMulticastLoopback(${enabled}) until socket is bound`
      )
      managed.pendingOptions.push({ type: 'multicastLoopback', value: enabled })
      return 0
    }

    try {
      managed.socket.setMulticastLoopback(enabled)
      return 0
    } catch (error) {
      debug(`[${managed.pluginId}] setMulticastLoopback error: ${error}`)
      return -1
    }
  }

  setBroadcast(socketId: number, enabled: boolean): number {
    const managed = this.sockets.get(socketId)
    if (!managed) return -1

    // If socket is not yet bound, defer the option
    if (!managed.bound) {
      debug(
        `[${managed.pluginId}] Deferring setBroadcast(${enabled}) until socket is bound`
      )
      managed.pendingOptions.push({ type: 'broadcast', value: enabled })
      return 0
    }

    try {
      managed.socket.setBroadcast(enabled)
      return 0
    } catch (error) {
      debug(`[${managed.pluginId}] setBroadcast error: ${error}`)
      return -1
    }
  }

  /**
   * Send data via UDP
   * @param socketId - Socket to use
   * @param data - Data to send
   * @param address - Destination address
   * @param port - Destination port
   * @returns Bytes sent, or -1 on error
   */
  send(
    socketId: number,
    data: Buffer,
    address: string,
    port: number
  ): Promise<number> {
    return new Promise((resolve) => {
      const managed = this.sockets.get(socketId)
      if (!managed) {
        debug(`Socket ${socketId} not found`)
        resolve(-1)
        return
      }

      managed.socket.send(data, port, address, (err, bytes) => {
        if (err) {
          debug(`[${managed.pluginId}] Send error: ${err}`)
          resolve(-1)
        } else {
          resolve(bytes)
        }
      })
    })
  }

  /**
   * Receive data from buffer (non-blocking)
   * @param socketId - Socket to receive from
   * @returns Buffered datagram, or null if buffer empty
   */
  receive(socketId: number): BufferedDatagram | null {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`Socket ${socketId} not found`)
      return null
    }

    return managed.receiveBuffer.shift() || null
  }

  /**
   * Get number of buffered datagrams
   */
  getBufferedCount(socketId: number): number {
    const managed = this.sockets.get(socketId)
    return managed ? managed.receiveBuffer.length : 0
  }

  /**
   * Close a socket
   * @param socketId - Socket to close
   */
  close(socketId: number): void {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`Socket ${socketId} not found`)
      return
    }

    try {
      // Leave all multicast groups first
      for (const group of managed.multicastGroups) {
        try {
          managed.socket.dropMembership(group)
        } catch (e) {
          // Ignore errors when leaving groups during close
        }
      }

      managed.socket.close()
      this.sockets.delete(socketId)
      debug(`[${managed.pluginId}] Socket ${socketId} closed`)
    } catch (error) {
      debug(`[${managed.pluginId}] Close error: ${error}`)
    }
  }

  /**
   * Close all sockets for a plugin (cleanup on plugin stop)
   */
  closeAllForPlugin(pluginId: string): void {
    const toClose: number[] = []
    for (const [id, managed] of this.sockets) {
      if (managed.pluginId === pluginId) {
        toClose.push(id)
      }
    }
    for (const id of toClose) {
      this.close(id)
    }
    debug(`[${pluginId}] Closed ${toClose.length} sockets`)
  }

  /**
   * Get socket statistics
   */
  getStats(): {
    totalSockets: number
    socketsPerPlugin: Record<string, number>
  } {
    const socketsPerPlugin: Record<string, number> = {}
    for (const managed of this.sockets.values()) {
      socketsPerPlugin[managed.pluginId] =
        (socketsPerPlugin[managed.pluginId] || 0) + 1
    }
    return {
      totalSockets: this.sockets.size,
      socketsPerPlugin
    }
  }
}

// Export singleton instance
export const socketManager = new SocketManager()

// =============================================================================
// TCP Socket Manager
// =============================================================================

/**
 * Managed TCP socket with line-buffered receive
 */
interface ManagedTcpSocket {
  socket: net.Socket
  pluginId: string
  connected: boolean
  connecting: boolean
  receiveBuffer: string[] // Line-buffered for protocol parsing
  rawBuffer: Buffer[] // Raw data buffer for binary protocols
  partialLine: string // Incomplete line data
  maxBufferSize: number
  error: string | null
  useLineBuffering: boolean // If false, use raw buffering
}

/**
 * TCP Socket Manager - manages TCP connections for WASM plugins
 *
 * Key differences from UDP:
 * - Connection-oriented (connect before send)
 * - Line-buffered receive (splits on \r\n or \n)
 */
class TcpSocketManager {
  private sockets: Map<number, ManagedTcpSocket> = new Map()
  private nextSocketId: number = 1

  /**
   * Create a new TCP socket
   * @param pluginId - Plugin that owns the socket
   * @returns Socket ID, or -1 on error
   */
  createSocket(pluginId: string): number {
    try {
      const socketId = this.nextSocketId++
      const socket = new net.Socket()

      const managed: ManagedTcpSocket = {
        socket,
        pluginId,
        connected: false,
        connecting: false,
        receiveBuffer: [],
        rawBuffer: [],
        partialLine: '',
        maxBufferSize: 1000,
        error: null,
        useLineBuffering: true // Default to line buffering
      }

      // Set up data handler
      socket.on('data', (data: Buffer) => {
        if (managed.useLineBuffering) {
          // Line-buffered mode for text protocols
          managed.partialLine += data.toString()

          // Split on line endings (\r\n or \n)
          const lines = managed.partialLine.split(/\r?\n/)

          // Last element is either empty (if data ended with newline) or partial
          managed.partialLine = lines.pop() || ''

          // Add complete lines to buffer
          for (const line of lines) {
            if (line.length > 0) {
              if (managed.receiveBuffer.length >= managed.maxBufferSize) {
                managed.receiveBuffer.shift() // Drop oldest
              }
              managed.receiveBuffer.push(line)
            }
          }
        } else {
          // Raw mode for binary protocols
          if (managed.rawBuffer.length >= managed.maxBufferSize) {
            managed.rawBuffer.shift() // Drop oldest
          }
          managed.rawBuffer.push(Buffer.from(data))
        }
      })

      socket.on('connect', () => {
        managed.connected = true
        managed.connecting = false
        managed.error = null
        debug(`[${pluginId}] TCP socket ${socketId} connected`)
      })

      socket.on('error', (err) => {
        managed.error = err.message
        managed.connected = false
        managed.connecting = false
        debug(`[${pluginId}] TCP socket ${socketId} error: ${err.message}`)
      })

      socket.on('close', () => {
        managed.connected = false
        managed.connecting = false
        this.sockets.delete(socketId)
        debug(`[${pluginId}] TCP socket ${socketId} closed`)
      })

      socket.on('end', () => {
        managed.connected = false
        debug(`[${pluginId}] TCP socket ${socketId} ended by remote`)
      })

      this.sockets.set(socketId, managed)
      debug(`[${pluginId}] Created TCP socket ${socketId}`)
      return socketId
    } catch (error) {
      debug(`Failed to create TCP socket: ${error}`)
      return -1
    }
  }

  /**
   * Connect to a remote host
   * @param socketId - Socket to connect
   * @param address - Remote host address
   * @param port - Remote port
   * @returns 0 if connection initiated, -1 on error
   */
  connect(socketId: number, address: string, port: number): number {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`TCP socket ${socketId} not found`)
      return -1
    }

    if (managed.connected || managed.connecting) {
      debug(
        `[${managed.pluginId}] TCP socket ${socketId} already connected/connecting`
      )
      return -1
    }

    try {
      managed.connecting = true
      managed.error = null
      managed.socket.connect(port, address)
      debug(
        `[${managed.pluginId}] TCP socket ${socketId} connecting to ${address}:${port}`
      )
      return 0
    } catch (error) {
      managed.connecting = false
      managed.error = String(error)
      debug(`[${managed.pluginId}] TCP connect error: ${error}`)
      return -1
    }
  }

  /**
   * Check if socket is connected
   * @param socketId - Socket to check
   * @returns 1 if connected, 0 if not, -1 if socket not found
   */
  isConnected(socketId: number): number {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      return -1
    }
    return managed.connected ? 1 : 0
  }

  /**
   * Send data over TCP
   * @param socketId - Socket to use
   * @param data - Data to send
   * @returns Bytes sent, or -1 on error
   */
  send(socketId: number, data: Buffer): Promise<number> {
    return new Promise((resolve) => {
      const managed = this.sockets.get(socketId)
      if (!managed) {
        debug(`TCP socket ${socketId} not found`)
        resolve(-1)
        return
      }

      if (!managed.connected) {
        debug(`[${managed.pluginId}] TCP socket ${socketId} not connected`)
        resolve(-1)
        return
      }

      managed.socket.write(data, (err) => {
        if (err) {
          debug(`[${managed.pluginId}] TCP send error: ${err}`)
          resolve(-1)
        } else {
          resolve(data.length)
        }
      })
    })
  }

  /**
   * Receive a complete line (non-blocking)
   * @param socketId - Socket to receive from
   * @returns Complete line without line ending, or null if no complete line available
   */
  receiveLine(socketId: number): string | null {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`TCP socket ${socketId} not found`)
      return null
    }

    return managed.receiveBuffer.shift() || null
  }

  /**
   * Receive raw data (non-blocking)
   * @param socketId - Socket to receive from
   * @returns Raw data buffer, or null if no data available
   */
  receiveRaw(socketId: number): Buffer | null {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`TCP socket ${socketId} not found`)
      return null
    }

    return managed.rawBuffer.shift() || null
  }

  /**
   * Set buffering mode
   * @param socketId - Socket to configure
   * @param lineBuffering - true for line-buffered (text), false for raw (binary)
   * @returns 0 on success, -1 on error
   */
  setLineBuffering(socketId: number, lineBuffering: boolean): number {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      return -1
    }
    managed.useLineBuffering = lineBuffering
    debug(
      `[${managed.pluginId}] TCP socket ${socketId} buffering mode: ${lineBuffering ? 'line' : 'raw'}`
    )
    return 0
  }

  /**
   * Get number of buffered items (lines or raw chunks)
   */
  getBufferedCount(socketId: number): number {
    const managed = this.sockets.get(socketId)
    if (!managed) return 0
    return managed.useLineBuffering
      ? managed.receiveBuffer.length
      : managed.rawBuffer.length
  }

  /**
   * Get last error message
   */
  getError(socketId: number): string | null {
    const managed = this.sockets.get(socketId)
    return managed ? managed.error : null
  }

  /**
   * Close a TCP socket
   * @param socketId - Socket to close
   */
  close(socketId: number): void {
    const managed = this.sockets.get(socketId)
    if (!managed) {
      debug(`TCP socket ${socketId} not found`)
      return
    }

    try {
      managed.socket.destroy()
      this.sockets.delete(socketId)
      debug(`[${managed.pluginId}] TCP socket ${socketId} closed`)
    } catch (error) {
      debug(`[${managed.pluginId}] TCP close error: ${error}`)
    }
  }

  /**
   * Close all TCP sockets for a plugin
   */
  closeAllForPlugin(pluginId: string): void {
    const toClose: number[] = []
    for (const [id, managed] of this.sockets) {
      if (managed.pluginId === pluginId) {
        toClose.push(id)
      }
    }
    for (const id of toClose) {
      this.close(id)
    }
    debug(`[${pluginId}] Closed ${toClose.length} TCP sockets`)
  }

  /**
   * Get TCP socket statistics
   */
  getStats(): {
    totalSockets: number
    socketsPerPlugin: Record<string, number>
  } {
    const socketsPerPlugin: Record<string, number> = {}
    for (const managed of this.sockets.values()) {
      socketsPerPlugin[managed.pluginId] =
        (socketsPerPlugin[managed.pluginId] || 0) + 1
    }
    return {
      totalSockets: this.sockets.size,
      socketsPerPlugin
    }
  }
}

// Export TCP socket manager singleton
export const tcpSocketManager = new TcpSocketManager()

// Export types
export type { BufferedDatagram, ManagedSocket, ManagedTcpSocket }
