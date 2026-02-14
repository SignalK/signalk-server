import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type UnknownRecord = Record<string, unknown>
type EnvImportOptions = {
  pluginId: string
  capabilities: Record<string, boolean>
  app?: UnknownRecord
  memoryRef: { current: WebAssembly.Memory | null }
  rawExports: { current: unknown }
  asLoaderInstance: { current: unknown }
}
type EnvImportsModule = {
  createEnvImports: (options: EnvImportOptions) => Record<string, unknown>
  createUtf8Reader: (memoryRef: {
    current: WebAssembly.Memory | null
  }) => (ptr: number, len: number) => string
}

type SocketManager = {
  createSocket: (...args: unknown[]) => number
  bind: (...args: unknown[]) => Promise<number>
  joinMulticast: (...args: unknown[]) => number
  leaveMulticast: (...args: unknown[]) => number
  setMulticastTTL: (...args: unknown[]) => number
  setMulticastLoopback: (...args: unknown[]) => number
  setBroadcast: (...args: unknown[]) => number
  send: (...args: unknown[]) => Promise<number>
  getBufferedCount: (...args: unknown[]) => number
  receive: (...args: unknown[]) => {
    data: Buffer
    address: string
    port: number
    timestamp: number
  } | null
  close: (...args: unknown[]) => void
}

type TcpSocketManager = {
  createSocket: (...args: unknown[]) => number
  connect: (...args: unknown[]) => number
  isConnected: (...args: unknown[]) => number
  setLineBuffering: (...args: unknown[]) => number
  send: (...args: unknown[]) => Promise<number>
  receiveLine: (...args: unknown[]) => string | null
  receiveRaw: (...args: unknown[]) => Buffer | null
  getBufferedCount: (...args: unknown[]) => number
  close: (...args: unknown[]) => void
}

const envImportsModule =
  require('../../src/wasm/bindings/env-imports') as EnvImportsModule

const socketModule = require('../../src/wasm/bindings/socket-manager') as {
  socketManager: SocketManager
  tcpSocketManager: TcpSocketManager
}

const writeString = (
  memory: WebAssembly.Memory,
  ptr: number,
  value: string
) => {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  new Uint8Array(memory.buffer).set(bytes, ptr)
  return bytes.length
}

const readString = (memory: WebAssembly.Memory, ptr: number, len: number) => {
  return new TextDecoder('utf-8').decode(
    new Uint8Array(memory.buffer, ptr, len)
  )
}

describe('wasm env imports', () => {
  it('reads UTF-8 strings from memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const reader = envImportsModule.createUtf8Reader({ current: memory })

    const len = writeString(memory, 0, 'hello')
    expect(reader(0, len)).to.equal('hello')
  })

  it('throws when UTF-8 reader lacks memory', () => {
    const reader = envImportsModule.createUtf8Reader({ current: null })
    expect(() => reader(0, 1)).to.throw(
      'AssemblyScript module memory not initialized'
    )
  })

  it('handles status, errors, and self path lookups', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    let status: string | null = null
    let error: string | null = null

    const app = {
      setPluginStatus: (_pluginId: string, message: string) => {
        status = message
      },
      setPluginError: (_pluginId: string, message: string) => {
        error = message
      },
      getSelfPath: () => ({ a: 1 })
    }

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: {},
      app,
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    const statusLen = writeString(memory, 0, 'ok')
    env.sk_set_status(0, statusLen)
    expect(status).to.equal('ok')

    const errorLen = writeString(memory, 10, 'fail')
    env.sk_set_error(10, errorLen)
    expect(error).to.equal('fail')

    const pathLen = writeString(memory, 20, 'navigation.speedOverGround')
    const resultLen = env.sk_get_self_path(20, pathLen, 100, 100)
    expect(readString(memory, 100, resultLen)).to.equal('{"a":1}')

    const tooSmall = env.sk_get_self_path(20, pathLen, 200, 2)
    expect(tooSmall).to.equal(0)
  })

  it('emits deltas and publishes notifications', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    const handled: Array<unknown[]> = []

    const app = {
      handleMessage: (...args: unknown[]) => {
        handled.push(args)
      }
    }

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: {},
      app,
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    const deltaLen = writeString(memory, 0, '{"updates":[]}')
    env.sk_handle_message(0, deltaLen, 2)
    expect(handled.length).to.equal(1)

    const pathLen = writeString(memory, 20, 'notifications.test')
    const valueLen = writeString(memory, 40, '{"state":"alarm","message":"x"}')
    expect(env.sk_publish_notification(20, pathLen, 40, valueLen)).to.equal(0)
    expect(handled.length).to.equal(2)

    const badLen = writeString(memory, 60, '{"message":"x"}')
    expect(env.sk_publish_notification(20, pathLen, 60, badLen)).to.equal(-1)
  })

  it('rejects invalid notification JSON or missing handler', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: {},
      app: {},
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    const pathLen = writeString(memory, 0, 'notifications.test')
    const valueLen = writeString(memory, 40, '{"state":"alarm"}')
    expect(env.sk_publish_notification(0, pathLen, 40, valueLen)).to.equal(-1)

    const invalidLen = writeString(memory, 60, '{not-json}')
    expect(env.sk_publish_notification(0, pathLen, 60, invalidLen)).to.equal(-1)
  })

  it('reads and writes plugin config', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-wasm-'))

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: {},
      app: { config: { configPath: tempDir } },
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    const configLen = writeString(memory, 0, '{"mode":"auto"}')
    expect(env.sk_save_config(0, configLen)).to.equal(0)

    const bufLen = env.sk_read_config(100, 100)
    expect(readString(memory, 100, bufLen)).to.equal('{"mode":"auto"}')

    const configFile = path.join(tempDir, 'plugin-config-data', 'plugin-a.json')
    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    expect(stored.configuration).to.deep.equal({ mode: 'auto' })

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('handles config errors and missing paths', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }

    const envNoPath = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: {},
      app: {},
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    expect(envNoPath.sk_read_config(0, 10)).to.equal(0)

    const badLen = writeString(memory, 0, '{bad-json}')
    expect(envNoPath.sk_save_config(0, badLen)).to.equal(-1)
  })

  it('checks capabilities and registers PUT handlers', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    type ActionResult = { statusCode?: number } & UnknownRecord
    type ActionCallback = (
      context: string,
      path: string,
      value: UnknownRecord,
      cb: (result: ActionResult) => void
    ) => void
    let registeredCallback: ActionCallback | null = null
    let metaCalls = 0

    const app = {
      handleMessage: () => {
        metaCalls += 1
      },
      registerActionHandler: (
        _context: string,
        _path: string,
        _pluginId: string,
        cb: ActionCallback
      ) => {
        registeredCallback = cb
      }
    }

    const asLoaderInstance = {
      current: {
        exports: {
          handle_put_vessels_self_navigation_speedOverGround: (
            valueJson: string
          ) => {
            const value = JSON.parse(valueJson)
            return JSON.stringify({
              state: 'COMPLETED',
              statusCode: 200,
              message: value
            })
          }
        }
      }
    }

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: { putHandlers: true },
      app,
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance
    })

    const contextLen = writeString(memory, 0, 'vessels.self')
    const pathLen = writeString(memory, 20, 'navigation.speedOverGround')

    expect(env.sk_register_put_handler(0, contextLen, 20, pathLen)).to.equal(1)
    expect(metaCalls).to.equal(1)

    let response: ActionResult | null = null
    registeredCallback?.(
      'vessels.self',
      'navigation.speedOverGround',
      { value: 1 },
      (result) => {
        response = result
      }
    )

    expect(response?.statusCode).to.equal(200)

    const capLen = writeString(memory, 40, 'rawSockets')
    expect(env.sk_has_capability(40, capLen)).to.equal(0)
  })

  it('handles PUT handler fallbacks', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }
    let registeredCallback: ActionCallback | null = null

    const app = {
      registerActionHandler: (
        _context: string,
        _path: string,
        _pluginId: string,
        cb: ActionCallback
      ) => {
        registeredCallback = cb
      }
    }

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: { putHandlers: true },
      app,
      memoryRef,
      rawExports: { current: {} },
      asLoaderInstance: { current: null }
    })

    const contextLen = writeString(memory, 0, 'vessels.self')
    const pathLen = writeString(memory, 20, 'navigation.speedOverGround')
    expect(env.sk_register_put_handler(0, contextLen, 20, pathLen)).to.equal(1)

    let response: ActionResult | null = null
    registeredCallback?.(
      'vessels.self',
      'navigation.speedOverGround',
      { value: 1 },
      (result) => {
        response = result
      }
    )
    expect(response?.statusCode).to.equal(501)

    const rawExports: UnknownRecord = {
      memory: new WebAssembly.Memory({ initial: 1 }),
      allocate: (size: number) => size,
      deallocate: () => undefined,
      handle_put_vessels_self_navigation_headingTrue: (
        _valuePtr: number,
        _valueLen: number,
        responsePtr: number,
        _responseMaxLen: number
      ) => {
        const responseBytes = Buffer.from(
          '{"state":"COMPLETED","statusCode":200}',
          'utf8'
        )
        const memView = new Uint8Array(rawExports.memory.buffer)
        memView.set(responseBytes, responsePtr)
        return responseBytes.length
      }
    }

    const envRaw = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: { putHandlers: true },
      app,
      memoryRef,
      rawExports: { current: rawExports },
      asLoaderInstance: { current: null }
    })

    const contextLen2 = writeString(memory, 60, 'vessels.self')
    const pathLen2 = writeString(memory, 80, 'navigation.headingTrue')
    expect(
      envRaw.sk_register_put_handler(60, contextLen2, 80, pathLen2)
    ).to.equal(1)

    let responseRaw: ActionResult | null = null
    registeredCallback?.(
      'vessels.self',
      'navigation.headingTrue',
      { value: 1 },
      (result) => {
        responseRaw = result
      }
    )

    expect(responseRaw?.statusCode).to.equal(200)
  })

  it('handles UDP and TCP bindings with stubbed socket managers', () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const memoryRef = { current: memory }

    const originalSocketManager = { ...socketModule.socketManager }
    const originalTcpManager = { ...socketModule.tcpSocketManager }

    socketModule.socketManager.createSocket = () => 5
    socketModule.socketManager.bind = () => Promise.resolve(0)
    socketModule.socketManager.joinMulticast = () => 0
    socketModule.socketManager.leaveMulticast = () => 0
    socketModule.socketManager.setMulticastTTL = () => 0
    socketModule.socketManager.setMulticastLoopback = () => 0
    socketModule.socketManager.setBroadcast = () => 0
    socketModule.socketManager.send = () => Promise.resolve(4)
    socketModule.socketManager.getBufferedCount = () => 1
    socketModule.socketManager.receive = () => ({
      data: Buffer.from([1, 2, 3]),
      address: '127.0.0.1',
      port: 1234,
      timestamp: Date.now()
    })
    socketModule.socketManager.close = () => undefined

    socketModule.tcpSocketManager.createSocket = () => 9
    socketModule.tcpSocketManager.connect = () => 0
    socketModule.tcpSocketManager.isConnected = () => 1
    socketModule.tcpSocketManager.setLineBuffering = () => 0
    socketModule.tcpSocketManager.send = () => Promise.resolve(2)
    socketModule.tcpSocketManager.receiveLine = () => 'line'
    socketModule.tcpSocketManager.receiveRaw = () => Buffer.from([7, 8])
    socketModule.tcpSocketManager.getBufferedCount = () => 2
    socketModule.tcpSocketManager.close = () => undefined

    const env = envImportsModule.createEnvImports({
      pluginId: 'plugin-a',
      capabilities: { rawSockets: true },
      app: {},
      memoryRef,
      rawExports: { current: null },
      asLoaderInstance: { current: null }
    })

    expect(env.sk_udp_create(0)).to.equal(5)
    expect(env.sk_udp_bind(5, 1000)).to.equal(0)

    const addrLen = writeString(memory, 0, '239.1.2.3')
    expect(env.sk_udp_join_multicast(5, 0, addrLen, 0, 0)).to.equal(0)
    expect(env.sk_udp_leave_multicast(5, 0, addrLen, 0, 0)).to.equal(0)
    expect(env.sk_udp_set_multicast_ttl(5, 2)).to.equal(0)
    expect(env.sk_udp_set_multicast_loopback(5, 1)).to.equal(0)
    expect(env.sk_udp_set_broadcast(5, 1)).to.equal(0)

    const dataLen = writeString(memory, 20, 'data')
    expect(env.sk_udp_send(5, 0, addrLen, 1000, 20, dataLen)).to.equal(dataLen)

    const recvLen = env.sk_udp_recv(5, 100, 3, 200, 300)
    expect(recvLen).to.equal(3)
    expect(readString(memory, 200, 9)).to.equal('127.0.0.1')

    expect(env.sk_udp_pending(5)).to.equal(1)
    env.sk_udp_close(5)

    expect(env.sk_tcp_create()).to.equal(9)
    expect(env.sk_tcp_connect(9, 0, addrLen, 2000)).to.equal(0)
    expect(env.sk_tcp_connected(9)).to.equal(1)
    expect(env.sk_tcp_set_line_buffering(9, 0)).to.equal(0)

    expect(env.sk_tcp_send(9, 20, 2)).to.equal(2)
    expect(env.sk_tcp_recv_line(9, 400, 10)).to.equal(4)
    expect(readString(memory, 400, 4)).to.equal('line')

    expect(env.sk_tcp_recv_raw(9, 500, 2)).to.equal(2)
    expect(Array.from(new Uint8Array(memory.buffer, 500, 2))).to.deep.equal([
      7, 8
    ])

    expect(env.sk_tcp_pending(9)).to.equal(2)
    env.sk_tcp_close(9)

    Object.assign(socketModule.socketManager, originalSocketManager)
    Object.assign(socketModule.tcpSocketManager, originalTcpManager)
  })
})
