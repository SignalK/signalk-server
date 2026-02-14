import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'

const require = createRequire(import.meta.url)

type Spark = EventEmitter & {
  id: string
  query: Record<string, string>
  sentMetaData: Record<string, unknown>
  onDrain?: () => void
  bufferSizeExceeded?: number
  request: {
    socket: {
      bufferSize: number
      on: (event: string, handler: () => void) => void
    }
    query: Record<string, string>
    connection: { remoteAddress: string }
    skPrincipal: { identifier: string }
  }
  writes: unknown[]
  write: (payload: unknown) => void
  end: (...args: unknown[]) => void
}

type WsApi = {
  start: () => void
  numClients: () => number
  canHandlePut: (path: string, source: string) => boolean
  handlePut: (
    requestId: string,
    context: string,
    path: string,
    source: string,
    value: number
  ) => Promise<{ statusCode: number }>
}

type WsApp = EventEmitter & {
  server: unknown
  intervals: NodeJS.Timeout[]
  selfContext: string
  config: {
    settings: {
      ssl: boolean
      wsCompression: boolean
      maxSendBufferSize: number
    }
  }
  securityStrategy: {
    canAuthorizeWS: () => boolean
    filterReadDelta: (_user: unknown, delta: unknown) => unknown
    shouldAllowWrite: () => boolean
    shouldAllowPut: () => boolean
    supportsLogin: () => boolean
    verifyWS: () => void
    authorizeWS?: (req: Record<string, unknown>) => void
    login?: (
      username: string,
      password: string
    ) => Promise<{ statusCode: number; token?: string }>
  }
  signalk: EventEmitter
  deltaCache: { getCachedDeltas: () => unknown[] }
  subscriptionmanager: { subscribe: () => void; unsubscribe: () => void }
  logging: { getLog: () => unknown[] }
  getHello: () => unknown
  handleMessage: () => void
  setProviderError: () => void
}

type RequestResponseModule = {
  createRequest: (
    app: WsApp,
    type: string,
    data: { context: string; put: { path: string; value: number } },
    userId: string,
    remoteAddress: string
  ) => Promise<{ requestId: string }>
  resetRequests: () => void
}

class FakePrimus {
  static instances: FakePrimus[] = []
  private connectionHandler?: (spark: Spark) => void
  private authorizeHandler?: (
    req: Record<string, unknown>,
    cb: (error?: unknown) => void
  ) => void
  private connections: Spark[] = []

  constructor(_server: unknown, _options: unknown) {
    FakePrimus.instances.push(this)
  }

  authorize(
    handler?: (
      req: Record<string, unknown>,
      cb: (error?: unknown) => void
    ) => void
  ) {
    if (handler) {
      this.authorizeHandler = handler
    }
    return undefined
  }

  on(event: string, handler: (spark: Spark) => void) {
    if (event === 'connection') {
      this.connectionHandler = handler
    }
  }

  forEach(handler: (spark: Spark) => void) {
    this.connections.forEach(handler)
  }

  connect(spark: Spark) {
    this.connections.push(spark)
    if (this.connectionHandler) {
      this.connectionHandler(spark)
    }
  }

  runAuthorize(req: Record<string, unknown>, cb: (error?: unknown) => void) {
    if (this.authorizeHandler) {
      this.authorizeHandler(req, cb)
    }
  }
}

describe('ws interface', () => {
  let app: WsApp
  let requestResponse: RequestResponseModule
  let wsFactory: (app: WsApp) => WsApi
  let originalPrimus: NodeJS.Module | undefined

  const loadWs = () => {
    const primusPath = require.resolve('primus')
    originalPrimus = require.cache[primusPath]
    require.cache[primusPath] = {
      id: primusPath,
      filename: primusPath,
      loaded: true,
      exports: FakePrimus
    }

    delete require.cache[require.resolve('../../src/interfaces/ws')]
    return require('../../src/interfaces/ws')
  }

  beforeEach(() => {
    FakePrimus.instances = []
    requestResponse =
      require('../../src/requestResponse') as RequestResponseModule

    app = Object.assign(new EventEmitter(), {
      server: {},
      intervals: [],
      selfContext: 'vessels.self',
      config: {
        settings: { ssl: false, wsCompression: false, maxSendBufferSize: 0 }
      },
      securityStrategy: {
        canAuthorizeWS: () => false,
        filterReadDelta: (_user: unknown, delta: unknown) => delta,
        shouldAllowWrite: () => true,
        shouldAllowPut: () => true,
        supportsLogin: () => false,
        verifyWS: () => undefined
      },
      signalk: new EventEmitter(),
      deltaCache: { getCachedDeltas: () => [] },
      subscriptionmanager: {
        subscribe: () => undefined,
        unsubscribe: () => undefined
      },
      logging: { getLog: () => [] },
      getHello: () => ({ hello: true }),
      handleMessage: () => undefined,
      setProviderError: () => undefined
    })

    wsFactory = loadWs() as (app: WsApp) => WsApi
  })

  afterEach(() => {
    requestResponse.resetRequests()
    app.intervals.forEach((interval: NodeJS.Timeout) => clearInterval(interval))

    const primusPath = require.resolve('primus')
    if (originalPrimus) {
      require.cache[primusPath] = originalPrimus
    } else {
      delete require.cache[primusPath]
    }
  })

  const createSpark = (): Spark => {
    const spark = new EventEmitter() as Spark
    spark.id = 'spark-1'
    spark.query = {}
    spark.sentMetaData = {}
    spark.request = {
      socket: {
        bufferSize: 0,
        on: (event: string, handler: () => void) => {
          if (event === 'drain') {
            spark.onDrain = handler
          }
        }
      },
      query: spark.query,
      connection: { remoteAddress: '127.0.0.1' },
      skPrincipal: { identifier: 'user' }
    }
    spark.write = (payload: unknown) => {
      spark.writes.push(payload)
    }
    spark.end = () => undefined
    spark.writes = [] as unknown[]
    return spark
  }

  it('tracks connected clients and handles put routing', async () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    primus.connect(spark)

    expect(api.numClients()).to.equal(1)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          updates: [
            {
              $source: 'src1',
              values: [{ path: 'navigation.speedOverGround', value: 1 }]
            }
          ]
        })
      )
    )

    expect(
      Boolean(api.canHandlePut('navigation.speedOverGround', 'src1'))
    ).to.equal(true)

    const request = await requestResponse.createRequest(
      app,
      'put',
      {
        context: 'vessels.self',
        put: { path: 'navigation.speedOverGround', value: 2 }
      },
      'user',
      '127.0.0.1'
    )

    const reply = await api.handlePut(
      request.requestId,
      'vessels.self',
      'navigation.speedOverGround',
      'src1',
      2
    )

    expect(reply.statusCode).to.equal(202)
    expect(spark.writes.length).to.be.greaterThan(1)
    expect(
      spark.writes.some((write) => (write as { put?: unknown }).put)
    ).to.equal(true)
  })

  it('rejects puts when no source is registered', async () => {
    const api = wsFactory(app)

    try {
      await api.handlePut(
        'id',
        'vessels.self',
        'navigation.speedOverGround',
        'src1',
        2
      )
      throw new Error('Expected rejection')
    } catch (error) {
      expect((error as Error).message).to.equal('no source found')
    }
  })

  it('streams server logs when subscribing to log', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const logs = [{ message: 'first' }]
    let subscribed = false

    app.logging.getLog = () => logs
    app.subscriptionmanager.subscribe = () => {
      subscribed = true
    }

    primus.connect(spark)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          subscribe: [{ path: 'log' }]
        })
      )
    )

    expect(subscribed).to.equal(false)
    expect(
      spark.writes.some(
        (write) =>
          (write as { type?: string; data?: { message?: string } }).type ===
            'LOG' &&
          (write as { data?: { message?: string } }).data?.message === 'first'
      )
    ).to.equal(true)

    app.emit('serverlog', { type: 'LOG', data: { message: 'second' } })
    expect(
      spark.writes.some(
        (write) =>
          (write as { data?: { message?: string } }).data?.message === 'second'
      )
    ).to.equal(true)
  })

  it('skips cached deltas when sendCachedValues is false', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    let cachedCalled = false

    app.deltaCache.getCachedDeltas = () => {
      cachedCalled = true
      return [
        {
          context: 'vessels.self',
          updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
        }
      ]
    }

    spark.query.sendCachedValues = 'false'
    primus.connect(spark)

    expect(cachedCalled).to.equal(false)
  })

  it('ends playback connection when startTime is missing', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[1]
    const spark = createSpark()
    const endArgs: unknown[] = []
    spark.end = (...args: unknown[]) => {
      endArgs.push(...args)
    }

    primus.connect(spark)

    expect(endArgs[0]).to.equal(
      'startTime is a required query parameter for playback connections'
    )
  })

  it('ends playback connection when history provider is missing', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[1]
    const spark = createSpark()
    const endArgs: unknown[] = []
    spark.query.startTime = new Date().toISOString()
    spark.end = (...args: unknown[]) => {
      endArgs.push(...args)
    }

    primus.connect(spark)

    expect(endArgs[0]).to.equal('No history provider')
  })

  it('disconnects when outgoing buffer stays above limit', () => {
    const envBackup = {
      MAXSENDBUFFERSIZE: process.env.MAXSENDBUFFERSIZE,
      MAXSENDBUFFERCHECKTIME: process.env.MAXSENDBUFFERCHECKTIME
    }

    process.env.MAXSENDBUFFERSIZE = '1'
    process.env.MAXSENDBUFFERCHECKTIME = '0'

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const endArgs: unknown[] = []
    spark.end = (...args: unknown[]) => {
      endArgs.push(...args)
    }
    spark.request.socket.bufferSize = 2
    spark.bufferSizeExceeded = Date.now() - 1000

    primus.connect(spark)

    app.signalk.emit('delta', {
      context: 'vessels.self',
      updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
    })

    expect(endArgs.length).to.be.greaterThan(0)
    expect((endArgs[0] as { errorMessage?: string }).errorMessage).to.equal(
      'Server outgoing buffer overflow, terminating connection'
    )

    if (typeof envBackup.MAXSENDBUFFERSIZE === 'undefined') {
      delete process.env.MAXSENDBUFFERSIZE
    } else {
      process.env.MAXSENDBUFFERSIZE = envBackup.MAXSENDBUFFERSIZE
    }

    if (typeof envBackup.MAXSENDBUFFERCHECKTIME === 'undefined') {
      delete process.env.MAXSENDBUFFERCHECKTIME
    } else {
      process.env.MAXSENDBUFFERCHECKTIME = envBackup.MAXSENDBUFFERCHECKTIME
    }
  })

  it('disconnects when verifyWS rejects a delta', () => {
    app.securityStrategy.canAuthorizeWS = () => true
    app.securityStrategy.verifyWS = () => {
      throw new Error('blocked')
    }

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const endArgs: unknown[] = []
    spark.end = (...args: unknown[]) => {
      endArgs.push(...args)
    }

    primus.connect(spark)

    app.signalk.emit('delta', {
      context: 'vessels.self',
      updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
    })

    expect(endArgs[0]).to.equal(
      '{message: "Connection disconnected by security constraint"}'
    )
    expect(endArgs[1]).to.deep.equal({ reconnect: true })
  })

  it('resets buffer size state when under limit', () => {
    const envBackup = {
      MAXSENDBUFFERSIZE: process.env.MAXSENDBUFFERSIZE,
      MAXSENDBUFFERCHECKTIME: process.env.MAXSENDBUFFERCHECKTIME
    }

    process.env.MAXSENDBUFFERSIZE = '1'
    process.env.MAXSENDBUFFERCHECKTIME = '0'

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    spark.request.socket.bufferSize = 0
    spark.bufferSizeExceeded = Date.now()

    primus.connect(spark)

    app.signalk.emit('delta', {
      context: 'vessels.self',
      updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
    })

    expect(spark.bufferSizeExceeded).to.equal(undefined)

    if (typeof envBackup.MAXSENDBUFFERSIZE === 'undefined') {
      delete process.env.MAXSENDBUFFERSIZE
    } else {
      process.env.MAXSENDBUFFERSIZE = envBackup.MAXSENDBUFFERSIZE
    }

    if (typeof envBackup.MAXSENDBUFFERCHECKTIME === 'undefined') {
      delete process.env.MAXSENDBUFFERCHECKTIME
    } else {
      process.env.MAXSENDBUFFERCHECKTIME = envBackup.MAXSENDBUFFERCHECKTIME
    }
  })

  it('unsubscribes from non-log subscriptions', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    let unsubscribeCalled = false

    app.subscriptionmanager.unsubscribe = () => {
      unsubscribeCalled = true
    }
    spark.sentMetaData = { existing: true }

    primus.connect(spark)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          unsubscribe: [{ path: 'navigation.speed' }]
        })
      )
    )

    expect(unsubscribeCalled).to.equal(true)
    expect(spark.sentMetaData).to.deep.equal({})
  })

  it('clears log subscription on unsubscribe', () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    let unsubscribeCalled = false

    spark.logUnsubscribe = () => {
      unsubscribeCalled = true
    }

    primus.connect(spark)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          unsubscribe: [{ path: 'log' }]
        })
      )
    )

    expect(unsubscribeCalled).to.equal(true)
    expect(spark.logUnsubscribe).to.equal(undefined)
  })

  it('authorizes websocket requests and sets source id', () => {
    const { InvalidTokenError } = require('../../src/security')

    app.securityStrategy.canAuthorizeWS = () => true
    app.securityStrategy.authorizeWS = (req: Record<string, unknown>) => {
      req.skPrincipal = { identifier: 'test.user' }
    }

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const req = { headers: {} } as Record<string, unknown>
    let authorizedCalled = false

    primus.runAuthorize(req, () => {
      authorizedCalled = true
    })

    expect(authorizedCalled).to.equal(true)
    expect(req.source).to.equal('ws.test_user')

    const failingApp = Object.assign(new EventEmitter(), {
      server: {},
      intervals: [],
      selfContext: 'vessels.self',
      config: {
        settings: { ssl: false, wsCompression: false, maxSendBufferSize: 0 }
      },
      securityStrategy: {
        canAuthorizeWS: () => true,
        filterReadDelta: (_user: unknown, delta: unknown) => delta,
        shouldAllowWrite: () => true,
        shouldAllowPut: () => true,
        supportsLogin: () => false,
        verifyWS: () => undefined,
        authorizeWS: () => {
          throw new InvalidTokenError('bad')
        }
      },
      signalk: new EventEmitter(),
      deltaCache: { getCachedDeltas: () => [] },
      subscriptionmanager: {
        subscribe: () => undefined,
        unsubscribe: () => undefined
      },
      logging: { getLog: () => [] },
      getHello: () => ({ hello: true }),
      handleMessage: () => undefined,
      setProviderError: () => undefined
    })

    wsFactory = loadWs() as (app: WsApp) => WsApi
    wsFactory(failingApp).start()

    const failingPrimus = FakePrimus.instances[FakePrimus.instances.length - 2]
    let invalidTokenError: unknown
    failingPrimus.runAuthorize({ headers: {} }, (error) => {
      invalidTokenError = error
    })
    expect(invalidTokenError).to.be.instanceOf(InvalidTokenError)
  })

  it('accumulates deltas during backpressure and flushes on drain', () => {
    const envBackup = { ...process.env }
    process.env.BACKPRESSURE_ENTER = '1'
    process.env.BACKPRESSURE_EXIT = '0'

    wsFactory = loadWs() as (app: WsApp) => WsApi
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    spark.request.socket.bufferSize = 10

    primus.connect(spark)

    const writeCountBefore = spark.writes.length

    app.signalk.emit('delta', {
      context: 'vessels.self',
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 1 }]
        }
      ]
    })

    expect(spark.backpressure.active).to.equal(true)
    expect(spark.backpressure.accumulator.size).to.equal(1)
    expect(spark.writes.length).to.equal(writeCountBefore)

    spark.request.socket.bufferSize = 0
    spark.onDrain?.()

    expect(spark.backpressure.active).to.equal(false)
    expect(spark.backpressure.accumulator.size).to.equal(0)
    expect(spark.writes.length).to.be.greaterThan(writeCountBefore)

    process.env = envBackup
  })

  it('skips buffer checks when max buffer size is zero', () => {
    const envBackup = {
      MAXSENDBUFFERSIZE: process.env.MAXSENDBUFFERSIZE
    }
    process.env.MAXSENDBUFFERSIZE = '0'

    wsFactory = loadWs() as (app: WsApp) => WsApi
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const endArgs: unknown[] = []
    spark.end = (...args: unknown[]) => {
      endArgs.push(...args)
    }
    spark.request.socket.bufferSize = 999
    spark.bufferSizeExceeded = Date.now() - 1000

    primus.connect(spark)

    app.signalk.emit('delta', {
      context: 'vessels.self',
      updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
    })

    expect(endArgs.length).to.equal(0)

    if (typeof envBackup.MAXSENDBUFFERSIZE === 'undefined') {
      delete process.env.MAXSENDBUFFERSIZE
    } else {
      process.env.MAXSENDBUFFERSIZE = envBackup.MAXSENDBUFFERSIZE
    }
  })

  it('responds to request queries and missing requests', async () => {
    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const expectedIds = new Set<string>()
    const replyPromise = new Promise<void>((resolve) => {
      const originalWrite = spark.write
      spark.write = (payload: unknown) => {
        originalWrite(payload)
        const requestId = (payload as { requestId?: string }).requestId
        if (requestId && expectedIds.has(requestId)) {
          expectedIds.delete(requestId)
          if (expectedIds.size === 0) {
            resolve()
          }
        }
      }
    })
    primus.connect(spark)

    const request = await requestResponse.createRequest(
      app,
      'put',
      {
        context: 'vessels.self',
        put: { path: 'navigation.speed', value: 1 }
      },
      'user',
      '127.0.0.1'
    )

    expectedIds.add(request.requestId)
    expectedIds.add('missing')

    spark.emit(
      'data',
      Buffer.from(JSON.stringify({ requestId: request.requestId, query: true }))
    )

    spark.emit(
      'data',
      Buffer.from(JSON.stringify({ requestId: 'missing', query: true }))
    )

    await replyPromise

    const hasQueryReply = spark.writes.some(
      (write) =>
        (write as { requestId?: string }).requestId === request.requestId
    )
    const hasMissingReply = spark.writes.some(
      (write) =>
        (write as { requestId?: string; statusCode?: number }).requestId ===
          'missing' && (write as { statusCode?: number }).statusCode === 404
    )

    expect(hasQueryReply).to.equal(true)
    expect(hasMissingReply).to.equal(true)
  })

  it('handles login requests and authorization', async () => {
    app.securityStrategy.supportsLogin = () => true
    app.securityStrategy.login = async () => ({
      statusCode: 200,
      token: 'token-1'
    })
    app.securityStrategy.authorizeWS = (req: Record<string, unknown>) => {
      req.skPrincipal = { identifier: 'user' }
    }

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const replyPromise = new Promise<void>((resolve) => {
      const originalWrite = spark.write
      spark.write = (payload: unknown) => {
        originalWrite(payload)
        if ((payload as { requestId?: string }).requestId === 'login-1') {
          resolve()
        }
      }
    })
    primus.connect(spark)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          requestId: 'login-1',
          login: { username: 'user', password: 'pw' }
        })
      )
    )

    await replyPromise

    const loginReply = spark.writes.find(
      (write) => (write as { requestId?: string }).requestId === 'login-1'
    ) as { statusCode?: number; login?: { token?: string } }

    expect(loginReply?.statusCode).to.equal(200)
    expect(loginReply?.login?.token).to.equal('token-1')
    expect(spark.request.token).to.equal('token-1')
  })

  it('returns 502 on login failures', async () => {
    app.securityStrategy.supportsLogin = () => true
    app.securityStrategy.login = async () => {
      throw new Error('login failed')
    }

    const api = wsFactory(app)
    api.start()

    const primus = FakePrimus.instances[0]
    const spark = createSpark()
    const replyPromise = new Promise<void>((resolve) => {
      const originalWrite = spark.write
      spark.write = (payload: unknown) => {
        originalWrite(payload)
        if ((payload as { requestId?: string }).requestId === 'login-2') {
          resolve()
        }
      }
    })
    primus.connect(spark)

    spark.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          requestId: 'login-2',
          login: { username: 'user', password: 'pw' }
        })
      )
    )

    await replyPromise

    const loginReply = spark.writes.find(
      (write) => (write as { requestId?: string }).requestId === 'login-2'
    ) as { statusCode?: number }

    expect(loginReply?.statusCode).to.equal(502)
  })
})
