import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type RequestLike = {
  path?: string
  query?: Record<string, string>
  headers?: Record<string, string>
}

type ResponseLike = {
  statusCode: number
  payload: unknown
  status: (code: number) => ResponseLike
  send: (payload: unknown) => ResponseLike
  json: (payload: unknown) => ResponseLike
}

type Handler = (req: RequestLike, res: ResponseLike, next: () => void) => void

type RestApp = {
  selfId: string
  config: { settings: { ssl: boolean }; version: string }
  interfaces: Record<string, unknown>
  securityStrategy: { anyACLs: () => boolean }
  signalk: { retrieve: () => unknown }
  deltaCache: {
    buildFull: () => unknown
    buildFullFromDeltas: () => unknown
  }
  use: () => void
  get: (path: string, handler: Handler) => void
  historyProvider?: {
    getHistory: (
      date: Date,
      path: string[],
      cb: (deltas: unknown[]) => void
    ) => void
  }
}

describe('rest interface', () => {
  let routes: Record<string, Handler>
  let app: RestApp
  let getMetadataOriginal: unknown

  const makeRes = () => {
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload: unknown) {
        this.payload = payload
        return this
      },
      json(payload: unknown) {
        this.payload = payload
        return this
      }
    }
    return res
  }

  const loadRest = (metadata: Record<string, unknown>) => {
    const signalkPath = require.resolve('@signalk/signalk-schema')
    getMetadataOriginal = require.cache[signalkPath]
    require.cache[signalkPath] = {
      id: signalkPath,
      filename: signalkPath,
      loaded: true,
      exports: {
        getMetadata: (path: string) => metadata[path]
      }
    }

    delete require.cache[require.resolve('../../src/interfaces/rest')]
    return require('../../src/interfaces/rest')
  }

  beforeEach(() => {
    routes = {}
    app = {
      selfId: 'self',
      config: { settings: { ssl: false }, version: '1.0.0' },
      interfaces: {},
      securityStrategy: { anyACLs: () => false },
      signalk: {
        retrieve: () => ({
          vessels: { self: { navigation: { speedOverGround: 2 } } }
        })
      },
      deltaCache: {
        buildFull: () => ({
          vessels: { self: { navigation: { speedOverGround: 1 } } }
        }),
        buildFullFromDeltas: () => ({
          vessels: { self: { navigation: { speedOverGround: 5 } } }
        })
      },
      use: () => undefined,
      get: (path: string, handler: Handler) => {
        routes[path] = handler
      }
    }
  })

  afterEach(() => {
    const signalkPath = require.resolve('@signalk/signalk-schema')
    if (getMetadataOriginal) {
      require.cache[signalkPath] = getMetadataOriginal as NodeJS.Module
    } else {
      delete require.cache[signalkPath]
    }
  })

  it('returns self identifier', () => {
    const rest = loadRest({})
    rest(app).start()

    const res = makeRes()
    routes['/signalk/v1/api/*'](
      { path: '/signalk/v1/api/self', query: {} },
      res,
      () => undefined
    )

    expect(res.payload).to.equal('vessels.self')
  })

  it('serves metadata and metadata properties', () => {
    const meta = {
      'vessels.self.navigation.speedOverGround': {
        displayName: 'SOG',
        units: 'm/s'
      }
    }
    const rest = loadRest(meta)
    rest(app).start()

    const resMeta = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/vessels/self/navigation/speedOverGround/meta',
        query: {}
      },
      resMeta,
      () => undefined
    )
    expect(resMeta.payload).to.deep.equal({ displayName: 'SOG', units: 'm/s' })

    const resValue = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/vessels/self/navigation/speedOverGround/meta/displayName',
        query: {}
      },
      resValue,
      () => undefined
    )
    expect(resValue.payload).to.equal('SOG')
  })

  it('validates snapshot query and handles history provider', () => {
    const rest = loadRest({})
    rest(app).start()

    const resMissing = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/snapshot/vessels/self/navigation/speedOverGround',
        query: {}
      },
      resMissing,
      () => undefined
    )
    expect(resMissing.statusCode).to.equal(400)

    const resInvalid = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/snapshot/vessels/self/navigation/speedOverGround',
        query: { time: 'invalid' }
      },
      resInvalid,
      () => undefined
    )
    expect(resInvalid.statusCode).to.equal(400)

    const resNoHistory = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/snapshot/vessels/self/navigation/speedOverGround',
        query: { time: '2018-12-11T18:40:03.246Z' }
      },
      resNoHistory,
      () => undefined
    )
    expect(resNoHistory.statusCode).to.equal(501)

    app.historyProvider = {
      getHistory: (
        _date: Date,
        _path: string[],
        cb: (deltas: unknown[]) => void
      ) => {
        cb([{}])
      }
    }

    const resHistory = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/snapshot/vessels/self/navigation/speedOverGround',
        query: { time: '2018-12-11T18:40:03.246Z' }
      },
      resHistory,
      () => undefined
    )

    expect(resHistory.payload).to.equal(5)
  })

  it('resolves normal paths and root endpoints', () => {
    const rest = loadRest({})
    rest(app).start()

    const resPath = makeRes()
    routes['/signalk/v1/api/*'](
      {
        path: '/signalk/v1/api/vessels/self/navigation/speedOverGround',
        query: {}
      },
      resPath,
      () => undefined
    )
    expect(resPath.payload).to.equal(2)

    const resRoot = makeRes()
    routes['/signalk'](
      { headers: { host: 'localhost:3000' } },
      resRoot,
      () => undefined
    )
    const payload = resRoot.payload as {
      endpoints: { v1: Record<string, string> }
    }
    const endpoints = payload.endpoints.v1
    expect(endpoints['signalk-http']).to.equal(
      'http://localhost:3000/signalk/v1/api/'
    )
    expect(endpoints['signalk-ws']).to.equal(
      'ws://localhost:3000/signalk/v1/stream'
    )
  })
})
