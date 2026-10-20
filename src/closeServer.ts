import type { Server, Socket } from 'net'

const connections = new WeakMap<Server, Set<Socket>>()

// Records every socket the server accepts, so closeServer() can end the ones
// that are still open when the server stops.
export function trackConnections(server: Server): void {
  const sockets = new Set<Socket>()
  connections.set(server, sockets)
  server.on('connection', (socket: Socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
}

// server.close() calls back only once every connection has ended. A WebSocket
// whose client does not answer the close frame, such as one on a sleeping
// tablet, stays open for ws's close timeout of 30 s, and a request that never
// completes stays open longer. Sockets still open after graceMs are destroyed.
export function closeServer(
  server: Server,
  graceMs: number,
  cb: () => void
): void {
  const forceClose = setTimeout(() => {
    for (const socket of connections.get(server) ?? []) {
      socket.destroy()
    }
  }, graceMs)
  forceClose.unref()
  server.close(() => {
    clearTimeout(forceClose)
    cb()
  })
}
