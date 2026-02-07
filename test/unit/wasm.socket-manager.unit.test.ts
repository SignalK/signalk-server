import { expect } from 'chai'
import { EventEmitter } from 'events'
import { createRequire } from 'module'

type FakeAddress = { address: string; port: number }

class FakeDgramSocket extends EventEmitter {
  public broadcastEnabled = false
  public multicastTtl: number | null = null
  public multicastLoopback: boolean | null = null
  public memberships: Array<{ addr: string; iface?: string }> = []
  public droppedMemberships: Array<{ addr: string; iface?: string }> = []
  private boundAddress: FakeAddress = { address: '0.0.0.0', port: 0 }

  bind(port: number, address: string | undefined, callback: () => void) {
    this.boundAddress = { address: address || '0.0.0.0', port }
    callback()
  }

  address() {
    return this.boundAddress
  }

  setBroadcast(enabled: boolean) {
    this.broadcastEnabled = enabled
  }

  setMulticastTTL(ttl: number) {
    this.multicastTtl = ttl
  }

  setMulticastLoopback(enabled: boolean) {
    this.multicastLoopback = enabled
  }

  addMembership(addr: string, iface?: string) {
    this.memberships.push({ addr, iface })
  }

  dropMembership(addr: string, iface?: string) {
    this.droppedMemberships.push({ addr, iface })
  }

  send(
    data: Buffer,
    _port: number,
    _address: string,
    callback: (err: Error | null, bytes: number) => void
  ) {
    callback(null, data.length)
  }

  close() {
    this.emit('close')
  }
}

class FakeNetSocket extends EventEmitter {
  public destroyed = false

  connect(_port: number, _address: string) {
    this.emit('connect')
  }

  write(_data: Buffer, callback: (err?: Error | null) => void) {
    callback(null)
    return true
  }

  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

const require = createRequire(import.meta.url)

type MockEntry = { id: string; previous?: NodeModule }

const mockModule = (entries: MockEntry[], id: string, exports: unknown) => {
  const resolved = require.resolve(id)
  entries.push({ id: resolved, previous: require.cache[resolved] })
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  } as NodeModule
}

const loadSocketManager = () => {
  const entries: MockEntry[] = []
  const createdDgramSockets: FakeDgramSocket[] = []
  const createdNetSockets: FakeNetSocket[] = []

  mockModule(entries, 'dgram', {
    createSocket: () => {
      const socket = new FakeDgramSocket()
      createdDgramSockets.push(socket)
      return socket
    }
  })

  mockModule(entries, 'net', {
    Socket: class extends FakeNetSocket {
      constructor() {
        super()
        createdNetSockets.push(this)
      }
    }
  })

  const modulePath = require.resolve('../../src/wasm/bindings/socket-manager')
  delete require.cache[modulePath]

  const socketModule = require(modulePath) as {
    socketManager: {
      createSocket: (pluginId: string, type?: 'udp4' | 'udp6') => number
      bind: (
        socketId: number,
        port: number,
        address?: string
      ) => Promise<number>
      joinMulticast: (
        socketId: number,
        multicastAddress: string,
        interfaceAddress?: string
      ) => number
      leaveMulticast: (
        socketId: number,
        multicastAddress: string,
        interfaceAddress?: string
      ) => number
      setMulticastTTL: (socketId: number, ttl: number) => number
      setMulticastLoopback: (socketId: number, enabled: boolean) => number
      setBroadcast: (socketId: number, enabled: boolean) => number
      send: (
        socketId: number,
        data: Buffer,
        address: string,
        port: number
      ) => Promise<number>
      receive: (socketId: number) => {
        data: Buffer
        address: string
        port: number
        timestamp: number
      } | null
      getBufferedCount: (socketId: number) => number
      close: (socketId: number) => void
      closeAllForPlugin: (pluginId: string) => void
      getStats: () => {
        totalSockets: number
        socketsPerPlugin: Record<string, number>
      }
    }
    tcpSocketManager: {
      createSocket: (pluginId: string) => number
      connect: (socketId: number, address: string, port: number) => number
      isConnected: (socketId: number) => number
      send: (socketId: number, data: Buffer) => Promise<number>
      receiveLine: (socketId: number) => string | null
      receiveRaw: (socketId: number) => Buffer | null
      setLineBuffering: (socketId: number, lineBuffering: boolean) => number
      getBufferedCount: (socketId: number) => number
      getError: (socketId: number) => string | null
      close: (socketId: number) => void
      closeAllForPlugin: (pluginId: string) => void
      getStats: () => {
        totalSockets: number
        socketsPerPlugin: Record<string, number>
      }
    }
  }

  return {
    socketModule,
    createdDgramSockets,
    createdNetSockets,
    restore: () => {
      delete require.cache[modulePath]
      entries.forEach(({ id, previous }) => {
        if (previous) {
          require.cache[id] = previous
        } else {
          delete require.cache[id]
        }
      })
    }
  }
}

describe('wasm socket manager bindings', () => {
  let socketModule: ReturnType<typeof loadSocketManager>['socketModule']
  let createdDgramSockets: FakeDgramSocket[]
  let createdNetSockets: FakeNetSocket[]
  let restore: (() => void) | null = null

  beforeEach(() => {
    const loaded = loadSocketManager()
    socketModule = loaded.socketModule
    createdDgramSockets = loaded.createdDgramSockets
    createdNetSockets = loaded.createdNetSockets
    restore = loaded.restore
  })

  afterEach(() => {
    if (restore) {
      restore()
      restore = null
    }
  })

  it('buffers UDP messages and applies deferred options', async () => {
    const socketId = socketModule.socketManager.createSocket('plugin-a', 'udp4')
    const socket = createdDgramSockets[0]

    expect(
      socketModule.socketManager.joinMulticast(socketId, '239.1.2.3')
    ).to.equal(0)
    expect(socketModule.socketManager.setBroadcast(socketId, true)).to.equal(0)
    expect(socketModule.socketManager.setMulticastTTL(socketId, 3)).to.equal(0)
    expect(
      socketModule.socketManager.setMulticastLoopback(socketId, true)
    ).to.equal(0)

    const bindResult = await socketModule.socketManager.bind(
      socketId,
      1234,
      '0.0.0.0'
    )
    expect(bindResult).to.equal(0)

    expect(socket.broadcastEnabled).to.equal(true)
    expect(socket.multicastTtl).to.equal(3)
    expect(socket.multicastLoopback).to.equal(true)
    expect(socket.memberships).to.deep.equal([
      { addr: '239.1.2.3', iface: undefined }
    ])

    socket.emit('message', Buffer.from([4, 5]), {
      address: '127.0.0.1',
      port: 5555
    })
    expect(socketModule.socketManager.getBufferedCount(socketId)).to.equal(1)

    const datagram = socketModule.socketManager.receive(socketId)
    expect(datagram?.address).to.equal('127.0.0.1')
    expect(datagram?.port).to.equal(5555)
    expect(Array.from(datagram?.data || [])).to.deep.equal([4, 5])
  })

  it('sends UDP data and closes sockets', async () => {
    const socketId = socketModule.socketManager.createSocket('plugin-a')
    const socket = createdDgramSockets[0]

    await socketModule.socketManager.bind(socketId, 0)
    const sent = await socketModule.socketManager.send(
      socketId,
      Buffer.from('abc'),
      '127.0.0.1',
      1000
    )

    expect(sent).to.equal(3)

    expect(
      socketModule.socketManager.leaveMulticast(socketId, '239.1.2.3')
    ).to.equal(0)
    socket.memberships.push({ addr: '239.1.2.3' })

    socketModule.socketManager.close(socketId)
    expect(socket.droppedMemberships).to.deep.equal([
      { addr: '239.1.2.3', iface: undefined }
    ])
  })

  it('tracks socket stats and closeAll', async () => {
    const firstId = socketModule.socketManager.createSocket('plugin-a')
    const secondId = socketModule.socketManager.createSocket('plugin-b')

    await socketModule.socketManager.bind(firstId, 0)
    await socketModule.socketManager.bind(secondId, 0)

    const stats = socketModule.socketManager.getStats()
    expect(stats.totalSockets).to.equal(2)
    expect(stats.socketsPerPlugin['plugin-a']).to.equal(1)

    socketModule.socketManager.closeAllForPlugin('plugin-a')
    const statsAfter = socketModule.socketManager.getStats()
    expect(statsAfter.totalSockets).to.equal(1)
  })

  it('handles UDP error paths and missing sockets', async () => {
    expect(await socketModule.socketManager.bind(999, 0)).to.equal(-1)
    expect(socketModule.socketManager.joinMulticast(999, '239.0.0.1')).to.equal(
      -1
    )
    expect(
      socketModule.socketManager.leaveMulticast(999, '239.0.0.1')
    ).to.equal(-1)
    expect(socketModule.socketManager.setBroadcast(999, true)).to.equal(-1)
    expect(socketModule.socketManager.setMulticastTTL(999, 1)).to.equal(-1)
    expect(socketModule.socketManager.setMulticastLoopback(999, true)).to.equal(
      -1
    )
    expect(
      await socketModule.socketManager.send(
        999,
        Buffer.from('a'),
        '127.0.0.1',
        1000
      )
    ).to.equal(-1)
    expect(socketModule.socketManager.receive(999)).to.equal(null)
    expect(socketModule.socketManager.getBufferedCount(999)).to.equal(0)
    socketModule.socketManager.close(999)

    const socketId = socketModule.socketManager.createSocket('plugin-a')
    const socket = createdDgramSockets[0]
    await socketModule.socketManager.bind(socketId, 0)

    socket.setBroadcast = () => {
      throw new Error('boom')
    }
    expect(socketModule.socketManager.setBroadcast(socketId, true)).to.equal(-1)

    socket.send = (
      _data: Buffer,
      _port: number,
      _address: string,
      callback: (err: Error | null, bytes: number) => void
    ) => {
      callback(new Error('fail'), 0)
    }

    const sendResult = await socketModule.socketManager.send(
      socketId,
      Buffer.from('a'),
      '127.0.0.1',
      1000
    )
    expect(sendResult).to.equal(-1)
  })

  it('handles TCP line buffering and raw buffering', async () => {
    const socketId = socketModule.tcpSocketManager.createSocket('plugin-tcp')
    const tcpSocket = createdNetSockets[0]

    expect(socketModule.tcpSocketManager.isConnected(socketId)).to.equal(0)
    expect(
      socketModule.tcpSocketManager.connect(socketId, '127.0.0.1', 5000)
    ).to.equal(0)
    expect(socketModule.tcpSocketManager.isConnected(socketId)).to.equal(1)

    tcpSocket.emit('data', Buffer.from('hello\nworld\n'))
    expect(socketModule.tcpSocketManager.getBufferedCount(socketId)).to.equal(2)
    expect(socketModule.tcpSocketManager.receiveLine(socketId)).to.equal(
      'hello'
    )
    expect(socketModule.tcpSocketManager.receiveLine(socketId)).to.equal(
      'world'
    )

    expect(
      socketModule.tcpSocketManager.setLineBuffering(socketId, false)
    ).to.equal(0)
    tcpSocket.emit('data', Buffer.from([1, 2, 3]))
    const raw = socketModule.tcpSocketManager.receiveRaw(socketId)
    expect(Array.from(raw || [])).to.deep.equal([1, 2, 3])

    const sent = await socketModule.tcpSocketManager.send(
      socketId,
      Buffer.from('ping')
    )
    expect(sent).to.equal(4)
  })

  it('records TCP errors and closes sockets', () => {
    const socketId = socketModule.tcpSocketManager.createSocket('plugin-tcp')
    const tcpSocket = createdNetSockets[0]

    tcpSocket.emit('error', new Error('boom'))
    expect(socketModule.tcpSocketManager.getError(socketId)).to.equal('boom')

    socketModule.tcpSocketManager.close(socketId)
    expect(tcpSocket.destroyed).to.equal(true)
  })

  it('handles TCP connect and send errors', async () => {
    const socketId = socketModule.tcpSocketManager.createSocket('plugin-tcp')
    const socket = createdNetSockets[0]

    socket.emit('end')
    expect(socketModule.tcpSocketManager.isConnected(socketId)).to.equal(0)

    const sendResult = await socketModule.tcpSocketManager.send(
      socketId,
      Buffer.from('data')
    )
    expect(sendResult).to.equal(-1)

    socketModule.tcpSocketManager.closeAllForPlugin('plugin-tcp')
  })

  it('handles TCP missing sockets and reconnects', async () => {
    expect(socketModule.tcpSocketManager.isConnected(999)).to.equal(-1)
    expect(socketModule.tcpSocketManager.receiveLine(999)).to.equal(null)
    expect(socketModule.tcpSocketManager.receiveRaw(999)).to.equal(null)
    expect(socketModule.tcpSocketManager.setLineBuffering(999, true)).to.equal(
      -1
    )
    expect(socketModule.tcpSocketManager.getBufferedCount(999)).to.equal(0)
    expect(socketModule.tcpSocketManager.getError(999)).to.equal(null)
    expect(
      await socketModule.tcpSocketManager.send(999, Buffer.from('a'))
    ).to.equal(-1)
    socketModule.tcpSocketManager.close(999)

    const socketId = socketModule.tcpSocketManager.createSocket('plugin-tcp')
    const socket = createdNetSockets[0]
    socket.connect = () => undefined

    expect(
      socketModule.tcpSocketManager.connect(socketId, '127.0.0.1', 5000)
    ).to.equal(0)
    expect(
      socketModule.tcpSocketManager.connect(socketId, '127.0.0.1', 5000)
    ).to.equal(-1)

    socket.emit('connect')
    expect(
      socketModule.tcpSocketManager.connect(socketId, '127.0.0.1', 5000)
    ).to.equal(-1)
  })
})
