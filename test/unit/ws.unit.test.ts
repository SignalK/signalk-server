import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'

const require = createRequire(import.meta.url)

class FakePrimus {
  static instances: FakePrimus[] = []
  private connectionHandler?: (spark: any) => void
  private connections: any[] = []

  constructor(_server: unknown, _options: unknown) {
    FakePrimus.instances.push(this)
  }

  authorize() {
    return undefined
  }

  on(event: string, handler: (spark: any) => void) {
    if (event === 'connection') {
      this.connectionHandler = handler
    }
  }

  forEach(handler: (spark: any) => void) {
    this.connections.forEach(handler)
  }

  connect(spark: any) {
    this.connections.push(spark)
    if (this.connectionHandler) {
      this.connectionHandler(spark)
    }
  }
}

describe('ws interface', () => {
  let app: any
  let requestResponse: any
  let wsFactory: any
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
    requestResponse = require('../../src/requestResponse')

    app = {
      server: {},
      intervals: [],
      selfContext: 'vessels.self',
      config: { settings: { ssl: false, wsCompression: false, maxSendBufferSize: 0 } },
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
    }

    wsFactory = loadWs()
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

  const createSpark = () => {
    const spark = new EventEmitter() as any
    spark.id = 'spark-1'
    spark.query = {}
    spark.sentMetaData = {}
    spark.request = {
      socket: {
        bufferSize: 0,
        on: () => undefined
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

    spark.emit('data', Buffer.from(JSON.stringify({
      updates: [
        {
          $source: 'src1',
          values: [{ path: 'navigation.speedOverGround', value: 1 }]
        }
      ]
    })))

    expect(Boolean(api.canHandlePut('navigation.speedOverGround', 'src1'))).to.equal(true)

    const request = await requestResponse.createRequest(
      app,
      'put',
      { context: 'vessels.self', put: { path: 'navigation.speedOverGround', value: 2 } },
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
    expect(spark.writes.some((write) => (write as { put?: unknown }).put)).to.equal(true)
  })

  it('rejects puts when no source is registered', async () => {
    const api = wsFactory(app)

    try {
      await api.handlePut('id', 'vessels.self', 'navigation.speedOverGround', 'src1', 2)
      throw new Error('Expected rejection')
    } catch (error) {
      expect((error as Error).message).to.equal('no source found')
    }
  })
})
