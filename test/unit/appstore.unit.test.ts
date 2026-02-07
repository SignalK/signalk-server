import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type RequestLike = {
  params?: Record<string, string>
}

type ResponseLike = {
  statusCode: number
  payload: unknown
  done?: (payload?: unknown) => void
  status: (code: number) => ResponseLike
  json: (payload: unknown) => ResponseLike
}

type Handler = (req: RequestLike, res: ResponseLike) => void

type AppLike = {
  config: {
    version: string
    name: string
    description: string
  }
  plugins: unknown[]
  webapps: unknown[]
  addons: unknown[]
  embeddablewebapps: unknown[]
  providers: unknown[]
  emit: () => void
  post: (paths: string[] | string, handler: Handler) => void
  get: (path: string, handler: Handler) => void
}

type ModuleOverrides = {
  findModulesWithKeyword?: Record<string, unknown[]>
  installModule?: (
    config: unknown,
    name: string,
    version: string,
    out: (value: string) => void,
    err: (value: string) => void,
    done: (code: number) => void
  ) => void
  removeModule?: (
    config: unknown,
    name: string,
    out: (value: string) => void,
    err: (value: string) => void,
    done: (code: number) => void
  ) => void
  isTheServerModule?: (name: string, config: unknown) => boolean
  getLatestServerVersion?: (version: string) => Promise<string>
}

describe('appstore interface', () => {
  let app: AppLike
  let routes: Record<string, Handler>
  let originalModules: NodeJS.Module | undefined
  let originalCategories: NodeJS.Module | undefined
  let originalConstants: NodeJS.Module | undefined
  let envBackup: NodeJS.ProcessEnv

  const makeRes = () => {
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      done: undefined as undefined | ((payload?: unknown) => void),
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

  const loadAppStore = (overrides: ModuleOverrides = {}) => {
    const defaultInstallModule = (
      _config: unknown,
      _name: string,
      _version: string,
      _out: () => void,
      _err: () => void,
      done: (code: number) => void
    ) => {
      done(0)
    }

    const defaultRemoveModule = (
      _config: unknown,
      _name: string,
      _out: () => void,
      _err: () => void,
      done: (code: number) => void
    ) => {
      done(0)
    }

    const modulesPath = require.resolve('../../src/modules')
    const categoriesPath = require.resolve('../../src/categories')
    const constantsPath = require.resolve('../../src/constants')

    originalModules = require.cache[modulesPath]
    originalCategories = require.cache[categoriesPath]
    originalConstants = require.cache[constantsPath]

    require.cache[modulesPath] = {
      id: modulesPath,
      filename: modulesPath,
      loaded: true,
      exports: {
        installModule: overrides.installModule || defaultInstallModule,
        removeModule: overrides.removeModule || defaultRemoveModule,
        isTheServerModule: overrides.isTheServerModule || (() => false),
        findModulesWithKeyword: (keyword: string) => {
          const all = overrides.findModulesWithKeyword || {}
          return Promise.resolve(all[keyword] || [])
        },
        getLatestServerVersion:
          overrides.getLatestServerVersion || (() => Promise.resolve('1.2.0')),
        getAuthor: (pkg: { author?: string }) => pkg.author || 'Author',
        getKeywords: (pkg: { keywords?: string[] }) => pkg.keywords || []
      }
    }

    require.cache[categoriesPath] = {
      id: categoriesPath,
      filename: categoriesPath,
      loaded: true,
      exports: {
        getCategories: () => ['misc'],
        getAvailableCategories: () => ['misc']
      }
    }

    require.cache[constantsPath] = {
      id: constantsPath,
      filename: constantsPath,
      loaded: true,
      exports: { SERVERROUTESPREFIX: '/skServer' }
    }

    delete require.cache[require.resolve('../../src/interfaces/appstore')]
    return require('../../src/interfaces/appstore')
  }

  beforeEach(() => {
    envBackup = { ...process.env }
    routes = {}
    app = {
      config: {
        version: '1.0.0',
        name: 'signalk-server',
        description: 'desc'
      },
      plugins: [],
      webapps: [],
      addons: [],
      embeddablewebapps: [],
      providers: [],
      emit: () => undefined,
      post: (paths: string[] | string, handler: Handler) => {
        const list = Array.isArray(paths) ? paths : [paths]
        list.forEach((path) => {
          routes[path] = handler
        })
      },
      get: (path: string, handler: Handler) => {
        routes[path] = handler
      }
    }
  })

  afterEach(() => {
    process.env = envBackup

    const modulesPath = require.resolve('../../src/modules')
    const categoriesPath = require.resolve('../../src/categories')
    const constantsPath = require.resolve('../../src/constants')

    if (originalModules) {
      require.cache[modulesPath] = originalModules
    } else {
      delete require.cache[modulesPath]
    }
    if (originalCategories) {
      require.cache[categoriesPath] = originalCategories
    } else {
      delete require.cache[categoriesPath]
    }
    if (originalConstants) {
      require.cache[constantsPath] = originalConstants
    } else {
      delete require.cache[constantsPath]
    }
  })

  it('returns 404 when plugin is not available', async () => {
    const appstore = loadAppStore()
    appstore(app).start()

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/appstore/install/:name/:version'](
        { params: { name: 'unknown', version: '1.0.0' } },
        res
      )
    })

    expect(res.statusCode).to.equal(404)
    expect(res.payload).to.match(/No such webapp or plugin/i)
  })

  it('returns available appstore data', async () => {
    const plugin = {
      package: {
        name: 'sk-plugin',
        version: '1.0.0',
        description: 'plugin',
        date: '2020',
        author: 'Author',
        keywords: ['signalk-node-server-plugin']
      }
    }

    app.plugins = [
      { packageName: 'sk-plugin', version: '0.9.0', id: 'plugin-1' }
    ]
    process.env.SIGNALK_SERVER_IS_UPDATABLE = 'true'

    const appstore = loadAppStore({
      findModulesWithKeyword: {
        'signalk-node-server-plugin': [plugin],
        'signalk-embeddable-webapp': [],
        'signalk-webapp': []
      }
    })
    appstore(app).start()

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/appstore/available/']({}, res)
    })

    expect(res.payload.available).to.have.length(1)
    expect(res.payload.installed).to.have.length(1)
    expect(res.payload.updates).to.have.length(1)
    expect(res.payload.categories).to.deep.equal(['misc'])
  })

  it('returns 404 when removing missing module', async () => {
    const appstore = loadAppStore()
    appstore(app).start()

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/appstore/remove/:name'](
        { params: { name: 'unknown' } },
        res
      )
    })

    expect(res.statusCode).to.equal(404)
    expect(res.payload).to.match(/No such webapp or plugin/i)
  })

  it('queues installs and reports waiting modules', async () => {
    const pluginA = {
      package: {
        name: 'sk-plugin-a',
        version: '1.0.0',
        description: 'plugin-a',
        date: '2020',
        author: 'Author',
        keywords: ['signalk-node-server-plugin']
      }
    }
    const pluginB = {
      package: {
        name: 'sk-plugin-b',
        version: '1.0.0',
        description: 'plugin-b',
        date: '2020',
        author: 'Author',
        keywords: ['signalk-node-server-plugin']
      }
    }

    let pendingDone: ((code: number) => void) | undefined
    const appstore = loadAppStore({
      installModule: (_config, _name, _version, _out, _err, done) => {
        pendingDone = done
      },
      findModulesWithKeyword: {
        'signalk-node-server-plugin': [pluginA, pluginB],
        'signalk-embeddable-webapp': [],
        'signalk-webapp': []
      }
    })

    appstore(app).start()

    const resInstallA = makeRes()
    await new Promise<void>((resolve) => {
      resInstallA.done = () => resolve()
      routes['/skServer/appstore/install/:name/:version'](
        { params: { name: 'sk-plugin-a', version: '1.0.0' } },
        resInstallA
      )
    })

    const resInstallB = makeRes()
    await new Promise<void>((resolve) => {
      resInstallB.done = () => resolve()
      routes['/skServer/appstore/install/:name/:version'](
        { params: { name: 'sk-plugin-b', version: '1.0.0' } },
        resInstallB
      )
    })

    const resAvailable = makeRes()
    await new Promise<void>((resolve) => {
      resAvailable.done = () => resolve()
      routes['/skServer/appstore/available/']({}, resAvailable)
    })

    const installing = resAvailable.payload as {
      installing: Array<{
        name: string
        isInstalling?: boolean
        isWaiting?: boolean
      }>
    }

    expect(installing.installing).to.have.length(2)
    expect(
      installing.installing.find((item) => item.name === 'sk-plugin-a')
        ?.isInstalling
    ).to.equal(true)
    expect(
      installing.installing.find((item) => item.name === 'sk-plugin-b')
        ?.isWaiting
    ).to.equal(true)

    pendingDone?.(0)
  })

  it('filters updates when updates are disabled by env', async () => {
    process.env.PLUGINS_WITH_UPDATE_DISABLED = 'sk-plugin'
    const plugin = {
      package: {
        name: 'sk-plugin',
        version: '2.0.0',
        description: 'plugin',
        date: '2020',
        author: 'Author',
        keywords: ['signalk-node-server-plugin']
      }
    }

    app.plugins = [
      { packageName: 'sk-plugin', version: '1.0.0', id: 'plugin-1' }
    ]

    const appstore = loadAppStore({
      findModulesWithKeyword: {
        'signalk-node-server-plugin': [plugin],
        'signalk-embeddable-webapp': [],
        'signalk-webapp': []
      }
    })
    appstore(app).start()

    const res = makeRes()
    await new Promise<void>((resolve) => {
      res.done = () => resolve()
      routes['/skServer/appstore/available/']({}, res)
    })

    expect(res.payload.installed).to.have.length(1)
    expect(res.payload.updates).to.have.length(0)
  })
})
