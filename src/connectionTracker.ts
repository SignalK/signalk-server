import type { Server, Socket } from 'net'

// server.close() calls back only once every connection has ended. A WebSocket
// whose client does not answer the close frame, such as one on a sleeping
// tablet, stays open for ws's close timeout of 30 s, and a request that never
// completes stays open longer. The tracker records every socket the server
// accepts so close() can destroy the ones still open after the grace period.
export class ConnectionTracker {
  private readonly sockets = new Set<Socket>()

  constructor(private readonly server: Server) {
    server.on('connection', (socket: Socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })
  }

  close(graceMs: number, cb: () => void): void {
    const forceClose = setTimeout(() => {
      for (const socket of this.sockets) {
        socket.destroy()
      }
    }, graceMs)
    forceClose.unref()
    this.server.close(() => {
      clearTimeout(forceClose)
      cb()
    })
  }
}
