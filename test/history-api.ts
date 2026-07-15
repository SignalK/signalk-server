import chai from 'chai'
import fs from 'fs'
import path from 'path'
import { Value } from '@sinclair/typebox/value'
import { type TSchema, FormatRegistry } from '@sinclair/typebox'
import {
  ValuesResponseSchema,
  HistoryProvidersResponseSchema
} from '@signalk/server-api/typebox'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')
import {
  HistoryApiHttpRegistry,
  type HistoryApplication
} from '../dist/api/history/index.js'
import type {
  HistoryProvider,
  ValuesRequest,
  ValuesResponse,
  WithHistoryApi
} from '@signalk/server-api/history'
import type { Context, Path, Timestamp } from '@signalk/server-api'
import { Temporal } from '@js-temporal/polyfill'

chai.should()

FormatRegistry.Set('date-time', (value) => !isNaN(Date.parse(value)))

const FROM = '2025-01-01T00:00:00Z'
const TO = '2025-01-02T00:00:00Z'

function assertSchema(schema: TSchema, value: unknown, name: string) {
  const valid = Value.Check(schema, value)
  if (!valid) {
    const errors = [...Value.Errors(schema, value)]
    chai.assert.fail(
      `${name} validation failed:\n${JSON.stringify(errors, null, 2)}`
    )
  }
}

function mkDirSync(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

describe('History API v2', () => {
  describe('without provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let api: string
    let origConfigDir: string | undefined

    before(async function () {
      origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`
      server = await startServerP(port, false)
    })

    after(async function () {
      await server.stop()
      if (origConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
      }
    })

    it('returns 501 for /history/values when no provider is registered', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}`
      )
      res.status.should.equal(501)
      const body = await res.json()
      body.should.have.property('error')
    })
  })

  describe('with provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let api: string
    let origConfigDir: string | undefined
    let pluginConfigFile: string

    before(async function () {
      origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
      process.env.SIGNALK_NODE_CONFIG_DIR = path.join(
        __dirname,
        'plugin-test-config'
      )

      const pluginConfig = {
        enabled: true,
        configuration: {}
      }
      const configDir = path.join(
        __dirname,
        'plugin-test-config',
        'plugin-config-data'
      )
      mkDirSync(configDir)
      pluginConfigFile = path.join(configDir, 'testplugin.json')
      fs.writeFileSync(pluginConfigFile, JSON.stringify(pluginConfig))

      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`

      server = new Server({
        config: { settings: { port } }
      })
      await server.start()
    })

    after(async function () {
      await server.stop()
      if (fs.existsSync(pluginConfigFile)) {
        fs.unlinkSync(pluginConfigFile)
      }
      if (origConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
      }
    })

    it('lists testplugin as default provider', async function () {
      const res = await fetch(`${api}/history/_providers`)
      res.status.should.equal(200)
      const body = await res.json()
      assertSchema(
        HistoryProvidersResponseSchema,
        body,
        'HistoryProvidersResponse'
      )
      body.testplugin.isDefault.should.equal(true)
    })

    it('returns the default provider id', async function () {
      const res = await fetch(`${api}/history/_providers/_default`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.have.property('id', 'testplugin')
    })

    it('sets and reports the default provider', async function () {
      const postRes = await fetch(
        `${api}/history/_providers/_default/testplugin`,
        { method: 'POST' }
      )
      postRes.status.should.equal(200)
      const res = await fetch(`${api}/history/_providers/_default`)
      const body = await res.json()
      body.should.have.property('id', 'testplugin')
      body.should.have.property('configured', 'testplugin')
    })

    it('returns 400 when setting an unregistered provider as default', async function () {
      const res = await fetch(`${api}/history/_providers/_default/nosuch`, {
        method: 'POST'
      })
      res.status.should.equal(400)
    })

    it('returns values from the provider', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&resolution=60`
      )
      res.status.should.equal(200)
      const body = await res.json()
      assertSchema(ValuesResponseSchema, body, 'ValuesResponse')
      body.data.length.should.be.greaterThan(0)
    })

    it('returns paths from the provider', async function () {
      const res = await fetch(`${api}/history/paths?from=${FROM}&to=${TO}`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.be.an('array')
      body.should.include('navigation.position')
    })

    it('returns contexts from the provider', async function () {
      const res = await fetch(`${api}/history/contexts?from=${FROM}&to=${TO}`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.be.an('array')
      body.should.include('vessels.self')
    })

    it('returns 400 when paths is missing', async function () {
      const res = await fetch(`${api}/history/values?from=${FROM}&to=${TO}`)
      res.status.should.equal(400)
      const body = await res.json()
      body.should.have.property('error')
      body.error.should.contain('paths')
    })

    it('accepts a time expression resolution like 1m', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&resolution=1m`
      )
      res.status.should.equal(200)
    })

    it('returns 400 for unparseable resolution', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&resolution=1y`
      )
      res.status.should.equal(400)
      const body = await res.json()
      body.error.should.contain('resolution')
    })

    it('accepts an ISO 8601 duration string', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=PT15M`
      )
      res.status.should.equal(200)
    })

    it('accepts an integer number of seconds for duration', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=900`
      )
      res.status.should.equal(200)
    })

    it('returns 400 for an unparseable duration', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=not-a-duration`
      )
      res.status.should.equal(400)
      const body = await res.json()
      // Match against the specific error from the parser, not just any
      // mention of "duration", to avoid false greens from unrelated
      // validators that also mention the word.
      body.error.should.contain('ISO 8601')
    })
  })

  describe('default provider selection', () => {
    const providerContext = (name: string) => `vessels.${name}` as Context

    const provider = (name: string): HistoryProvider => ({
      getValues: async (): Promise<ValuesResponse> => ({
        context: providerContext(name),
        range: {
          from: FROM as Timestamp,
          to: TO as Timestamp
        },
        values: [{ path: 'navigation.position' as Path, method: 'first' }],
        data: [[FROM as Timestamp, null]]
      }),
      getContexts: async () => [],
      getPaths: async () => []
    })

    interface TestApp extends WithHistoryApi {
      config: { settings: { historyApi?: { defaultProvider?: string } } }
    }

    const makeApp = (configuredDefault?: string): TestApp => ({
      config: {
        settings: {
          historyApi: configuredDefault
            ? { defaultProvider: configuredDefault }
            : undefined
        }
      }
    })

    const makeRegistry = (app: TestApp) =>
      new HistoryApiHttpRegistry(app as unknown as HistoryApplication)

    const VALUES_QUERY: ValuesRequest = {
      duration: Temporal.Duration.from({ minutes: 15 }),
      pathSpecs: []
    }

    // Identifies the provider serving unqualified requests by the
    // context its getValues stub reports.
    const defaultOf = async (app: TestApp): Promise<Context> => {
      const api = await app.getHistoryApi!()
      return (await api.getValues(VALUES_QUERY)).context
    }

    it('uses the configured provider even when it registers last', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('falls back to the first registered provider when the configured one is not registered', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      ;(await defaultOf(app)).should.equal(providerContext('kip'))
    })

    it('reverts to the configured provider when the fallback unregisters', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      registry.unregisterHistoryApiProvider('kip')
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('falls back when the configured provider unregisters', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      registry.registerHistoryApiProvider('kip', provider('kip'))
      registry.unregisterHistoryApiProvider('questdb')
      ;(await defaultOf(app)).should.equal(providerContext('kip'))
    })

    it('defaults to the first registered provider without configuration', async function () {
      const app = makeApp()
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      ;(await defaultOf(app)).should.equal(providerContext('kip'))
    })

    it('rejects when no provider is registered', async function () {
      const app = makeApp('questdb')
      makeRegistry(app)
      await app.getHistoryApi!()
        .then(() => chai.assert.fail('should have rejected'))
        .catch((err: Error) =>
          err.message.should.contain('No history api provider')
        )
    })

    it('does not change the active provider when persisting fails', async function () {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const config = require('../dist/config/config')
      const origWriteSettingsFile = config.writeSettingsFile
      config.writeSettingsFile = (
        _app: unknown,
        _settings: unknown,
        cb: (err?: Error) => void
      ) => cb(new Error('disk full'))
      try {
        const app = makeApp() as TestApp & {
          securityStrategy: { shouldAllowPut: () => boolean }
          get: (path: string, handler: unknown) => void
          post: (path: string, handler: unknown) => void
        }
        app.securityStrategy = { shouldAllowPut: () => true }
        const postHandlers: Record<
          string,
          (req: unknown, res: unknown) => Promise<void>
        > = {}
        app.get = () => undefined
        app.post = (path, handler) => {
          postHandlers[path] = handler as (typeof postHandlers)[string]
        }

        const registry = makeRegistry(app)
        registry.registerHistoryApiProvider('kip', provider('kip'))
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        registry.start()

        let statusCode = 0
        const res = {
          status(code: number) {
            statusCode = code
            return this
          },
          json() {
            return this
          }
        }
        await postHandlers['/signalk/v2/api/history/_providers/_default/:id'](
          { params: { id: 'questdb' }, method: 'POST', path: '' },
          res
        )

        statusCode.should.equal(500)
        // the failed save must not have switched the default nor
        // mutated the persisted settings
        ;(await defaultOf(app)).should.equal(providerContext('kip'))
        chai.expect(app.config.settings.historyApi).to.equal(undefined)
      } finally {
        config.writeSettingsFile = origWriteSettingsFile
      }
    })
  })
})
