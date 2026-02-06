import { expect } from 'chai'
import { createRequire } from 'module'
import { EventEmitter } from 'events'

const require = createRequire(import.meta.url)

type RequestLike = {
  params?: Record<string, string>
  body?: Record<string, unknown>
}

type ResponseLike = {
  statusCode: number
  payload: unknown
  contentType?: string
  status: (code: number) => ResponseLike
  send: (payload?: unknown) => ResponseLike
  json: (payload: unknown) => ResponseLike
  type: (value: string) => ResponseLike
}

type Handler = (req: RequestLike, res: ResponseLike) => void

type AppLike = EventEmitter & {
  config: { settings: { pipedProviders: unknown[] } }
  discoveredProviders: unknown[]
  get: (path: string, handler: Handler) => void
  put: (path: string, handler: Handler) => void
  post: (path: string, handler: Handler) => void
  delete: (path: string, handler: Handler) => void
}

type Overrides = {
  writeSettingsFile?: (
    app: unknown,
    settings: unknown,
    cb: (err?: Error) => void
  ) => void
  runDiscovery?: (app: unknown) => void
}

describe('providers interface', () => {
  let app: AppLike
  let getRoutes: Record<string, Handler>
  let putRoutes: Record<string, Handler>
  let postRoutes: Record<string, Handler>
  let deleteRoutes: Record<string, Handler>
  let originalConfig: NodeJS.Module | undefined
  let originalDiscovery: NodeJS.Module | undefined

  const makeRes = (): ResponseLike => {
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      contentType: undefined as string | undefined,
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload?: unknown) {
        this.payload = payload
        return this
      },
      json(payload: unknown) {
        this.payload = payload
        return this
      },
      type(value: string) {
        this.contentType = value
        return this
      }
    }
    return res
  }

  const loadProviders = (overrides: Overrides = {}) => {
    const configPath = require.resolve('../../src/config/config')
    const discoveryPath = require.resolve('../../src/discovery')

    originalConfig = require.cache[configPath]
    originalDiscovery = require.cache[discoveryPath]

    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        writeSettingsFile:
          overrides.writeSettingsFile ||
          ((_app: unknown, _settings: unknown, cb: (err?: Error) => void) => {
            cb()
          })
      }
    }

    require.cache[discoveryPath] = {
      id: discoveryPath,
      filename: discoveryPath,
      loaded: true,
      exports: {
        runDiscovery: overrides.runDiscovery || (() => undefined)
      }
    }

    delete require.cache[require.resolve('../../src/interfaces/providers')]
    return require('../../src/interfaces/providers') as (app: AppLike) => void
  }

  beforeEach(() => {
    getRoutes = {}
    putRoutes = {}
    postRoutes = {}
    deleteRoutes = {}
    app = Object.assign(new EventEmitter(), {
      config: { settings: { pipedProviders: [] } },
      discoveredProviders: [],
      get: (path: string, handler: Handler) => {
        getRoutes[path] = handler
      },
      put: (path: string, handler: Handler) => {
        putRoutes[path] = handler
      },
      post: (path: string, handler: Handler) => {
        postRoutes[path] = handler
      },
      delete: (path: string, handler: Handler) => {
        deleteRoutes[path] = handler
      }
    })
  })

  afterEach(() => {
    const configPath = require.resolve('../../src/config/config')
    const discoveryPath = require.resolve('../../src/discovery')

    if (originalConfig) {
      require.cache[configPath] = originalConfig
    } else {
      delete require.cache[configPath]
    }

    if (originalDiscovery) {
      require.cache[discoveryPath] = originalDiscovery
    } else {
      delete require.cache[discoveryPath]
    }
  })

  it('lists providers with editable and readonly shapes', () => {
    app.config.settings.pipedProviders = [
      {
        id: 'simple',
        enabled: true,
        pipeElements: [
          {
            type: 'providers/simple',
            options: {
              logging: false,
              type: 'FileStream',
              subOptions: { dataType: 'NMEA0183', filename: 'data.log' }
            }
          }
        ]
      },
      {
        id: 'complex',
        enabled: false,
        pipeElements: [
          {
            type: 'providers/complex',
            options: { foo: 'bar' }
          }
        ]
      }
    ]

    const providers = loadProviders()
    providers(app)

    const res = makeRes()
    getRoutes['/skServer/providers']({}, res)

    const payload = res.payload as Array<Record<string, unknown>>
    const simple = payload.find((item) => item.id === 'simple')
    const complex = payload.find((item) => item.id === 'complex')

    expect(simple?.editable).to.equal(true)
    expect(simple?.options).to.deep.equal({
      dataType: 'NMEA0183',
      filename: 'data.log'
    })
    expect(complex?.editable).to.equal(false)
    expect(complex?.type).to.equal('providers/complex')
    expect((complex?.json as string) || '').to.contain('providers/complex')
  })

  it('adds providers and parses canboat options', () => {
    let savedSettings: unknown
    const providers = loadProviders({
      writeSettingsFile: (_app, settings, cb) => {
        savedSettings = settings
        cb()
      }
    })
    providers(app)

    const res = makeRes()
    postRoutes['/skServer/providers'](
      {
        body: {
          id: 'canboat',
          enabled: true,
          type: 'FileStream',
          logging: false,
          options: {
            type: 'canbus-canboatjs',
            uniqueNumber: '10',
            mfgCode: '5'
          }
        }
      },
      res
    )

    expect(res.payload).to.equal('Connection added')
    const stored = app.config.settings.pipedProviders[0] as {
      pipeElements: Array<{ options: { subOptions: Record<string, unknown> } }>
    }
    const subOptions = stored.pipeElements[0].options.subOptions
    expect(subOptions.uniqueNumber).to.equal(10)
    expect(subOptions.mfgCode).to.equal(5)
    expect(savedSettings).to.equal(app.config.settings)
  })

  it('deletes providers and returns errors for missing IDs', () => {
    const providers = loadProviders()
    providers(app)

    const resMissing = makeRes()
    deleteRoutes['/skServer/providers/:id'](
      { params: { id: 'missing' } },
      resMissing
    )
    expect(resMissing.statusCode).to.equal(401)

    app.config.settings.pipedProviders = [
      {
        id: 'to-delete',
        enabled: true,
        pipeElements: []
      }
    ]

    const resDelete = makeRes()
    deleteRoutes['/skServer/providers/:id'](
      { params: { id: 'to-delete' } },
      resDelete
    )

    expect(resDelete.payload).to.equal('Connection deleted')
    expect(app.config.settings.pipedProviders).to.have.length(0)
  })

  it('tracks discovery results and emits server events', () => {
    let emitted: unknown
    const providers = loadProviders()
    providers(app)

    app.on('serverevent', (evt) => {
      emitted = evt
    })

    app.emit('discovered', {
      id: 'discovered-1',
      enabled: true,
      pipeElements: [
        { type: 'providers/simple', options: { subOptions: { foo: 'bar' } } }
      ]
    })

    expect(app.discoveredProviders).to.have.length(1)
    const event = emitted as { data?: Array<{ isNew?: boolean }> }
    expect(event.data?.[0].isNew).to.equal(true)
  })
})
