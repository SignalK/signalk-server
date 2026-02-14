import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'

const require = createRequire(import.meta.url)

type RequestLike = {
  body: {
    value: string
    sendToServer?: boolean
    sendToN2K?: boolean
  }
}

type ResponseLike = {
  statusCode: number
  payload?: unknown
  status: (code: number) => ResponseLike
  json: (payload: unknown) => ResponseLike
  done?: (payload: unknown) => void
}

type Handler = (req: RequestLike, res: ResponseLike) => void

type AppLike = EventEmitter & {
  propertyValues?: unknown
  post: (path: string, handler: Handler) => void
  securityStrategy: {
    isDummy: () => boolean
    allowConfigure: (_req: RequestLike) => boolean
  }
  handleMessage: (source: string, msg: unknown) => void
}

describe('playground interface', () => {
  let routes: Record<string, Handler>
  let originalNmea0183: NodeJS.Module | undefined
  let originalN2k: NodeJS.Module | undefined
  let originalCanboat: NodeJS.Module | undefined
  let originalPut: NodeJS.Module | undefined

  const makeRes = () => {
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      done: undefined as ((payload: unknown) => void) | undefined,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: unknown) {
        this.payload = payload
        if (this.done) {
          this.done(payload)
        }
        return this
      }
    }
    return res
  }

  const loadPlayground = (overrides: {
    isN2KString?: (value: string) => boolean
    putPath?: (
      app: AppLike,
      context: string,
      path: string,
      put: { path: string; value: number },
      req: RequestLike,
      requestId: string,
      cb: (reply: { state: string; statusCode: number }) => void
    ) => void
    deletePath?: (
      app: AppLike,
      context: string,
      path: string,
      req: RequestLike,
      requestId: string,
      cb: (reply: { state: string; statusCode: number }) => void
    ) => void
  }) => {
    const nmea0183Path = require.resolve('@signalk/nmea0183-signalk')
    const n2kPath = require.resolve('@signalk/n2k-signalk')
    const canboatPath = require.resolve('@canboat/canboatjs')
    const putPathModule = require.resolve('../../src/put')

    originalNmea0183 = require.cache[nmea0183Path]
    originalN2k = require.cache[n2kPath]
    originalCanboat = require.cache[canboatPath]
    originalPut = require.cache[putPathModule]

    require.cache[nmea0183Path] = {
      id: nmea0183Path,
      filename: nmea0183Path,
      loaded: true,
      exports: class FakeParser0183 {
        parse() {
          return {
            updates: [{ values: [{ path: 'nmea0183', value: 1 }] }]
          }
        }
      }
    }

    require.cache[n2kPath] = {
      id: n2kPath,
      filename: n2kPath,
      loaded: true,
      exports: {
        N2kMapper: class FakeMapper {
          toDelta() {
            return {
              updates: [{ values: [{ path: 'n2k', value: 1 }] }]
            }
          }
        }
      }
    }

    require.cache[canboatPath] = {
      id: canboatPath,
      filename: canboatPath,
      loaded: true,
      exports: {
        isN2KString: overrides.isN2KString || (() => false),
        FromPgn: class FakeFromPgn {
          parseString() {
            return { pgn: 123 }
          }
        },
        pgnToActisenseSerialFormat: (msg: string) => msg
      }
    }

    const defaultPutPath = (
      _app: AppLike,
      _context: string,
      _path: string,
      _put: { path: string; value: number },
      _req: RequestLike,
      _requestId: string,
      cb: (reply: { state: string; statusCode: number }) => void
    ) => {
      cb({ state: 'COMPLETED', statusCode: 200 })
    }

    const defaultDeletePath = (
      _app: AppLike,
      _context: string,
      _path: string,
      _req: RequestLike,
      _requestId: string,
      cb: (reply: { state: string; statusCode: number }) => void
    ) => {
      cb({ state: 'COMPLETED', statusCode: 200 })
    }

    require.cache[putPathModule] = {
      id: putPathModule,
      filename: putPathModule,
      loaded: true,
      exports: {
        putPath: overrides.putPath ?? defaultPutPath,
        deletePath: overrides.deletePath ?? defaultDeletePath
      }
    }

    delete require.cache[require.resolve('../../src/interfaces/playground')]
    return require('../../src/interfaces/playground') as (app: AppLike) => void
  }

  const restoreModules = () => {
    const nmea0183Path = require.resolve('@signalk/nmea0183-signalk')
    const n2kPath = require.resolve('@signalk/n2k-signalk')
    const canboatPath = require.resolve('@canboat/canboatjs')
    const putPathModule = require.resolve('../../src/put')

    if (originalNmea0183) {
      require.cache[nmea0183Path] = originalNmea0183
    } else {
      delete require.cache[nmea0183Path]
    }

    if (originalN2k) {
      require.cache[n2kPath] = originalN2k
    } else {
      delete require.cache[n2kPath]
    }

    if (originalCanboat) {
      require.cache[canboatPath] = originalCanboat
    } else {
      delete require.cache[canboatPath]
    }

    if (originalPut) {
      require.cache[putPathModule] = originalPut
    } else {
      delete require.cache[putPathModule]
    }
  }

  beforeEach(() => {
    routes = {}
  })

  afterEach(() => {
    restoreModules()
  })

  it('rejects requests without configure permission', async () => {
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => false,
        allowConfigure: () => false
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({})
    playground(app)

    const res = makeRes()
    routes['/skServer/inputTest'](
      { body: { value: '$GPGLL,1', sendToServer: true } },
      res
    )

    expect(res.statusCode).to.equal(400)
    expect(res.payload).to.deep.equal({ error: 'permission denied' })
  })

  it('rejects sendToN2K when type is not n2k', () => {
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => false,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({
      isN2KString: () => false
    })
    playground(app)

    const res = makeRes()
    routes['/skServer/inputTest'](
      { body: { value: '$GPGLL,1', sendToN2K: true } },
      res
    )

    expect(res.statusCode).to.equal(400)
    expect(res.payload).to.deep.equal({
      error: 'Please enter NMEA 2000 json format or Actisense format'
    })
  })

  it('processes signalk put messages and returns results', async () => {
    const calls: string[] = []
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => true,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({
      putPath: (_app, _context, _path, _put, _req, _requestId, cb) => {
        calls.push('put')
        cb({ state: 'COMPLETED', statusCode: 200 })
      }
    })
    playground(app)

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/inputTest'](
        {
          body: {
            value: JSON.stringify({
              context: 'vessels.self',
              requestId: '1',
              put: { path: 'navigation.speed', value: 1 }
            }),
            sendToServer: true
          }
        },
        res
      )
    })

    expect(calls).to.deep.equal(['put'])
    const payload = res.payload as {
      putResults: Array<{ statusCode: number }>
    }
    expect(payload.putResults).to.have.length(1)
    expect(payload.putResults[0].statusCode).to.equal(200)
  })

  it('emits nmea2000out when sending N2K strings', () => {
    const emitted: string[] = []
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => false,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    app.on('nmea2000out', (msg: string) => {
      emitted.push(msg)
    })

    const playground = loadPlayground({
      isN2KString: () => true
    })
    playground(app)

    const res = makeRes()
    routes['/skServer/inputTest'](
      { body: { value: 'TESTN2K', sendToN2K: true } },
      res
    )

    expect(res.payload).to.deep.equal({ deltas: [] })
    expect(emitted).to.deep.equal(['TESTN2K'])
  })

  it('emits nmea2000JsonOut when sending N2K JSON', () => {
    const emitted: Array<{ pgn: number; data: string }> = []
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => false,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    app.on('nmea2000JsonOut', (msg: { pgn: number; data: string }) => {
      emitted.push(msg)
    })

    const playground = loadPlayground({})
    playground(app)

    const res = makeRes()
    routes['/skServer/inputTest'](
      {
        body: {
          value: JSON.stringify({ pgn: 123, data: 'abc' }),
          sendToN2K: true
        }
      },
      res
    )

    expect(res.payload).to.deep.equal({ deltas: [] })
    expect(emitted).to.deep.equal([{ pgn: 123, data: 'abc' }])
  })

  it('processes signalk delete messages and returns results', async () => {
    const calls: string[] = []
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => true,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({
      deletePath: (_app, _context, _path, _req, _requestId, cb) => {
        calls.push('delete')
        cb({ state: 'COMPLETED', statusCode: 200 })
      }
    })
    playground(app)

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/inputTest'](
        {
          body: {
            value: JSON.stringify({
              context: 'vessels.self',
              requestId: '1',
              delete: { path: 'navigation.speed' }
            }),
            sendToServer: true
          }
        },
        res
      )
    })

    expect(calls).to.deep.equal(['delete'])
    const payload = res.payload as {
      putResults: Array<{ statusCode: number }>
    }
    expect(payload.putResults).to.have.length(1)
    expect(payload.putResults[0].statusCode).to.equal(200)
  })

  it('processes n2k-json input into deltas', () => {
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => true,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({})
    playground(app)

    const res = makeRes()
    routes['/skServer/inputTest'](
      {
        body: {
          value: JSON.stringify([{ pgn: 123, data: 'abc' }])
        }
      },
      res
    )

    const payload = res.payload as {
      n2kJson: Array<{ pgn: number }>
      deltas: Array<{ updates: Array<{ values: unknown[] }> }>
    }
    expect(payload.n2kJson).to.have.length(1)
    expect(payload.deltas).to.have.length(1)
    expect(payload.deltas[0].updates[0].values).to.have.length(1)
  })

  it('returns a JSON parse error for invalid payloads', () => {
    const app = Object.assign(new EventEmitter(), {
      post: (path: string, handler: Handler) => {
        routes[path] = handler
      },
      securityStrategy: {
        isDummy: () => true,
        allowConfigure: () => true
      },
      handleMessage: () => undefined
    }) as AppLike

    const playground = loadPlayground({})
    playground(app)

    const originalError = console.error
    console.error = () => undefined

    const res = makeRes()
    routes['/skServer/inputTest']({ body: { value: '{bad json' } }, res)

    expect(res.statusCode).to.equal(400)
    expect(res.payload).to.have.property('error')

    console.error = originalError
  })
})
