import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

type Handler = (req: unknown, res: { json: (payload: unknown) => void }) => void

type AppLike = {
  config: { settings: { appPath?: string } }
  webapps?: Array<{ name: string }>
  embeddablewebapps?: Array<{ name: string }>
  addons?: Array<{ name: string }>
  pluginconfigurators?: Array<{ name: string }>
  use: (path: string, handler: unknown) => void
  get: (path: string, handler: Handler) => void
}

type ModuleInfo = {
  location: string
  module: string
  metadata: { name: string }
}

describe('webapps interface', () => {
  let app: AppLike
  let routes: Record<string, Handler>
  let mounts: Array<{ path: string }>
  let tempDir: string
  let originalModules: NodeJS.Module | undefined

  const loadWebapps = (modulesByKeyword: Record<string, ModuleInfo[]>) => {
    const modulesPath = require.resolve('../../src/modules')
    originalModules = require.cache[modulesPath]

    require.cache[modulesPath] = {
      id: modulesPath,
      filename: modulesPath,
      loaded: true,
      exports: {
        modulesWithKeyword: (_config: unknown, keyword: string) =>
          modulesByKeyword[keyword] || []
      }
    }

    delete require.cache[require.resolve('../../src/interfaces/webapps')]
    return require('../../src/interfaces/webapps') as (app: AppLike) => {
      start: () => void
    }
  }

  beforeEach(() => {
    routes = {}
    mounts = []
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-webapps-'))

    app = {
      config: { settings: {} },
      webapps: [{ name: 'existing-webapp' }],
      embeddablewebapps: [{ name: 'existing-embeddable' }],
      use: (mountPath: string) => {
        mounts.push({ path: mountPath })
      },
      get: (mountPath: string, handler: Handler) => {
        routes[mountPath] = handler
      }
    }
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })

    const modulesPath = require.resolve('../../src/modules')
    if (originalModules) {
      require.cache[modulesPath] = originalModules
    } else {
      delete require.cache[modulesPath]
    }
  })

  it('mounts node webapps and merges existing entries', () => {
    const moduleAPath = path.join(tempDir, 'webapp-a', 'public')
    const moduleBPath = path.join(tempDir, 'webapp-b')
    fs.mkdirSync(moduleAPath, { recursive: true })
    fs.mkdirSync(moduleBPath, { recursive: true })

    const modulesByKeyword = {
      'signalk-webapp': [
        {
          location: tempDir,
          module: 'webapp-a',
          metadata: { name: 'webapp-a' }
        },
        {
          location: tempDir,
          module: 'webapp-b',
          metadata: { name: 'existing-webapp' }
        }
      ],
      'signalk-node-server-addon': [
        {
          location: tempDir,
          module: 'addon-a',
          metadata: { name: 'addon-a' }
        }
      ],
      'signalk-embeddable-webapp': [
        {
          location: tempDir,
          module: 'embed-a',
          metadata: { name: 'embed-a' }
        }
      ],
      'signalk-plugin-configurator': [
        {
          location: tempDir,
          module: 'configurator-a',
          metadata: { name: 'configurator-a' }
        }
      ]
    }

    const webapps = loadWebapps(modulesByKeyword)
    webapps(app).start()

    const webappNames = app.webapps?.map((item) => item.name) || []
    expect(webappNames).to.have.members(['existing-webapp', 'webapp-a'])
    const embeddableNames =
      app.embeddablewebapps?.map((item) => item.name) || []
    expect(embeddableNames).to.have.members(['existing-embeddable', 'embed-a'])
    expect(app.pluginconfigurators?.map((item) => item.name)).to.deep.equal([
      'configurator-a'
    ])

    const mountPaths = mounts.map((item) => item.path)
    expect(mountPaths).to.include('/webapp-a')
    expect(mountPaths).to.include('/webapp-b')
  })

  it('serves webapps and addons via API', () => {
    const modulesByKeyword = {
      'signalk-webapp': [
        {
          location: tempDir,
          module: 'webapp-a',
          metadata: { name: 'webapp-a' }
        }
      ],
      'signalk-node-server-addon': [
        {
          location: tempDir,
          module: 'addon-a',
          metadata: { name: 'addon-a' }
        }
      ],
      'signalk-embeddable-webapp': [
        {
          location: tempDir,
          module: 'embed-a',
          metadata: { name: 'embed-a' }
        }
      ],
      'signalk-plugin-configurator': []
    }

    const webapps = loadWebapps(modulesByKeyword)
    webapps(app).start()

    let webappsPayload: unknown
    routes['/skServer/webapps'](
      {},
      {
        json: (payload) => {
          webappsPayload = payload
        }
      }
    )

    let addonsPayload: unknown
    routes['/skServer/addons'](
      {},
      {
        json: (payload) => {
          addonsPayload = payload
        }
      }
    )

    const allWebapps = webappsPayload as Array<{ name: string }>
    expect(allWebapps.map((item) => item.name)).to.have.members([
      'webapp-a',
      'embed-a',
      'existing-webapp',
      'existing-embeddable'
    ])

    const addons = addonsPayload as Array<{ name: string }>
    expect(addons.map((item) => item.name)).to.deep.equal(['addon-a'])
  })
})
