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
  type HistoryApplication,
  type HistoryProvidersEventData
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

    it('passes sourcePolicy=all to the provider', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.speedOverGround&from=${FROM}&to=${TO}&resolution=60&sourcePolicy=all`
      )
      res.status.should.equal(200)
      const body = await res.json()
      assertSchema(ValuesResponseSchema, body, 'ValuesResponse')
      body.values.should.deep.equal([
        {
          path: 'navigation.speedOverGround',
          method: 'average',
          $source: 'source.a'
        },
        {
          path: 'navigation.speedOverGround',
          method: 'average',
          $source: 'source.b'
        }
      ])
      body.data.should.deep.equal([['2025-01-01T12:00:00Z', 1.2, 2.4]])
    })

    it('returns 400 for invalid sourcePolicy', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&sourcePolicy=unknown`
      )
      res.status.should.equal(400)
      const body = await res.json()
      body.error.should.contain('sourcePolicy')
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

    interface NotificationValue {
      state: string
      message: string
    }

    interface TestApp extends WithHistoryApi {
      config: {
        safeToPersistSettings: boolean
        settings: {
          historyApi?: { defaultProvider?: string }
          pipedProviders?: unknown[]
          interfaces?: Record<string, boolean>
        }
      }
      handleMessage: (id: string, delta: unknown) => void
      /** Notification values captured from handleMessage */
      notifications: NotificationValue[]
      /** HISTORYPROVIDERS serverevent payloads captured from emit */
      serverEvents: HistoryProvidersEventData[]
      emit: (event: string, data: unknown) => void
    }

    const makeApp = (configuredDefault?: string): TestApp => {
      const notifications: NotificationValue[] = []
      const serverEvents: HistoryProvidersEventData[] = []
      return {
        config: {
          safeToPersistSettings: true,
          settings: {
            // Unrelated keys so the assertions can show the recorded
            // write carries the rest of the user's settings with it.
            pipedProviders: [{ id: 'gps' }],
            interfaces: { nmea0183: true },
            historyApi: configuredDefault
              ? { defaultProvider: configuredDefault }
              : undefined
          }
        },
        notifications,
        serverEvents,
        emit: (channel: string, e: unknown) => {
          // Only the replay-cached channel counts — a rename to e.g.
          // serverAdminEvent would silently lose the connect replay.
          if (channel !== 'serverevent') {
            return
          }
          const event = e as { type: string; data: HistoryProvidersEventData }
          if (event.type === 'HISTORYPROVIDERS') {
            serverEvents.push(event.data)
          }
        },
        handleMessage: (_id: string, delta: unknown) => {
          const update = (
            delta as {
              updates: { values: { value: NotificationValue }[] }[]
            }
          ).updates[0]
          notifications.push(update.values[0].value)
        }
      }
    }

    // Track every registry so afterEach can cancel pending grace
    // timers — a timer surviving its test would emit into a finished
    // test's serverEvents array.
    const registries: HistoryApiHttpRegistry[] = []
    const makeRegistry = (app: TestApp, unavailableGraceMs?: number) => {
      const registry = new HistoryApiHttpRegistry(
        app as unknown as HistoryApplication,
        unavailableGraceMs
      )
      registries.push(registry)
      return registry
    }

    // Recording the first provider writes settings, so every test in
    // this block goes through a stubbed writeSettingsFile: it captures
    // what would be persisted, and its callback runs inline so the
    // assertions need no timing guess. Stubbing also keeps the block
    // independent of whether an earlier suite built a Server, which
    // disables settings writes for the whole process.
    let settingsWrites: Array<{
      historyApi?: { defaultProvider?: string }
      pipedProviders?: unknown[]
      interfaces?: Record<string, boolean>
    }>
    let writeOutcome: (cb: (err?: Error) => void) => void
    let restoreWriteSettings: () => void

    beforeEach(() => {
      settingsWrites = []
      writeOutcome = (cb) => cb()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const config = require('../dist/config/config')
      const original = config.writeSettingsFile
      config.writeSettingsFile = (
        _app: unknown,
        settings: (typeof settingsWrites)[number],
        cb: (err?: Error) => void
      ) => {
        settingsWrites.push(settings)
        writeOutcome(cb)
      }
      restoreWriteSettings = () => {
        config.writeSettingsFile = original
      }
    })

    afterEach(() => {
      restoreWriteSettings()
      registries.splice(0).forEach((r) => r.stop())
    })

    const recordedDefault = (app: TestApp) =>
      app.config.settings.historyApi?.defaultProvider

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

    it('serves the first registered provider when settings name none', async function () {
      const app = makeApp()
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      ;(await defaultOf(app)).should.equal(providerContext('kip'))
    })

    it('records the first registered provider as the configured default', function () {
      const app = makeApp()
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      settingsWrites.length.should.equal(1)
      settingsWrites[0].historyApi!.defaultProvider!.should.equal('questdb')
      recordedDefault(app)!.should.equal('questdb')
    })

    it('records without dropping the rest of the settings', function () {
      const app = makeApp()
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      settingsWrites[0].should.deep.equal({
        pipedProviders: [{ id: 'gps' }],
        interfaces: { nmea0183: true },
        historyApi: { defaultProvider: 'questdb' }
      })
    })

    it('keeps the recorded default when a second provider registers', async function () {
      const app = makeApp()
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      registry.registerHistoryApiProvider('kip', provider('kip'))
      settingsWrites.length.should.equal(1)
      recordedDefault(app)!.should.equal('questdb')
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('honours the recorded default on the next start', async function () {
      const app = makeApp()
      const first = makeRegistry(app)
      first.registerHistoryApiProvider('questdb', provider('questdb'))

      // A fresh registry over the settings the first one wrote, with the
      // providers registering in the order that used to decide it.
      const restarted = makeRegistry(app)
      restarted.registerHistoryApiProvider('kip', provider('kip'))
      restarted.registerHistoryApiProvider('questdb', provider('questdb'))
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('leaves a configured default alone', function () {
      const app = makeApp('kip')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      settingsWrites.length.should.equal(0)
      recordedDefault(app)!.should.equal('kip')
    })

    it('treats an empty configured default as none', function () {
      const app = makeApp()
      app.config.settings.historyApi = { defaultProvider: '' }
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      recordedDefault(app)!.should.equal('questdb')
    })

    it('records nothing while settings hold runtime overrides', async function () {
      const app = makeApp()
      app.config.safeToPersistSettings = false
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      settingsWrites.length.should.equal(0)
      chai.expect(recordedDefault(app)).to.equal(undefined)
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('serves the provider even when recording it fails', async function () {
      const app = makeApp()
      writeOutcome = (cb) => cb(new Error('disk full'))
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      settingsWrites.length.should.equal(1)
      chai.expect(recordedDefault(app)).to.equal(undefined)
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('retries the first provider when a later one registers', async function () {
      const app = makeApp()
      writeOutcome = (cb) => cb(new Error('disk full'))
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      // The slot belongs to questdb even though its write failed, so the
      // arrival of kip must retry questdb rather than end the attempts.
      writeOutcome = (cb) => cb()
      registry.registerHistoryApiProvider('kip', provider('kip'))
      settingsWrites.length.should.equal(2)
      settingsWrites[1].historyApi!.defaultProvider!.should.equal('questdb')
      recordedDefault(app)!.should.equal('questdb')
      ;(await defaultOf(app)).should.equal(providerContext('questdb'))
    })

    it('drops the pending default when that provider unregisters', function () {
      const app = makeApp()
      writeOutcome = (cb) => cb(new Error('disk full'))
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      registry.unregisterHistoryApiProvider('questdb')
      // questdb is gone, so nothing may record it. kip arrives as the
      // only provider and claims the slot itself.
      writeOutcome = (cb) => cb()
      registry.registerHistoryApiProvider('kip', provider('kip'))
      recordedDefault(app)!.should.equal('kip')
    })

    it('reports a failed recording once per run', function () {
      const app = makeApp()
      writeOutcome = (cb) => cb(new Error('disk full'))
      const registry = makeRegistry(app)
      const reported: unknown[][] = []
      const originalError = console.error
      console.error = (...args: unknown[]) => {
        reported.push(args)
      }
      try {
        // A plugin that reconnects registers again; the retry must not
        // report again, or it floods the log ring the admin UI reads.
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
      } finally {
        console.error = originalError
      }
      settingsWrites.length.should.equal(2)
      reported.length.should.equal(1)
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

    it('emits a single warn notification when the configured provider is needed but unavailable', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      await defaultOf(app)
      await defaultOf(app)
      app.notifications.length.should.equal(1)
      app.notifications[0].state.should.equal('warn')
      app.notifications[0].message.should.contain('questdb')
      app.notifications[0].message.should.contain('kip')
    })

    it('clears the warning when the configured provider registers', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('kip', provider('kip'))
      await defaultOf(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      app.notifications.length.should.equal(2)
      app.notifications[1].state.should.equal('normal')
    })

    it('does not notify when the configured provider serves requests', async function () {
      const app = makeApp('questdb')
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      await defaultOf(app)
      app.notifications.length.should.equal(0)
    })

    it('records over an empty configured id', function () {
      const app = makeApp()
      // makeApp takes a truthy id, so the empty value goes in directly.
      app.config.settings.historyApi = { defaultProvider: '' }
      const registry = makeRegistry(app)
      registry.registerHistoryApiProvider('questdb', provider('questdb'))
      const event = app.serverEvents[app.serverEvents.length - 1]
      event.configuredId!.should.equal('questdb')
      event.defaultId!.should.equal('questdb')
    })

    describe('HISTORYPROVIDERS serverevent', () => {
      // Wide margin between the grace window and the wait so a stalled
      // event loop on loaded CI cannot invert the expected ordering.
      const TEST_GRACE_MS = 50
      const PAST_GRACE_MS = 250
      const wait = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms))
      const lastEvent = (app: TestApp) =>
        app.serverEvents[app.serverEvents.length - 1]

      it('reports the recorded provider as configured on an unconfigured server', function () {
        const app = makeApp()
        const registry = makeRegistry(app)

        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        lastEvent(app).should.deep.equal({
          ids: ['questdb'],
          defaultId: 'questdb',
          configuredId: 'questdb',
          configuredAvailable: true
        })
      })

      it('emits full state on register and unregister', function () {
        const app = makeApp('questdb')
        const registry = makeRegistry(app)

        registry.registerHistoryApiProvider('influx', provider('influx'))
        lastEvent(app).should.deep.equal({
          ids: ['influx'],
          defaultId: 'influx',
          configuredId: 'questdb',
          configuredAvailable: true
        })

        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        lastEvent(app).should.deep.equal({
          ids: ['influx', 'questdb'],
          defaultId: 'questdb',
          configuredId: 'questdb',
          configuredAvailable: true
        })

        registry.unregisterHistoryApiProvider('influx')
        lastEvent(app).should.deep.equal({
          ids: ['questdb'],
          defaultId: 'questdb',
          configuredId: 'questdb',
          configuredAvailable: true
        })
      })

      it('flags the configured provider unavailable only after the grace window', async function () {
        const app = makeApp('questdb')
        const registry = makeRegistry(app, TEST_GRACE_MS)
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        registry.registerHistoryApiProvider('influx', provider('influx'))

        registry.unregisterHistoryApiProvider('questdb')
        // The unregister itself must emit immediately (the provider
        // list changed) but not yet flag unavailability.
        lastEvent(app).should.deep.equal({
          ids: ['influx'],
          defaultId: 'influx',
          configuredId: 'questdb',
          configuredAvailable: true
        })

        await wait(PAST_GRACE_MS)
        lastEvent(app).should.deep.equal({
          ids: ['influx'],
          defaultId: 'influx',
          configuredId: 'questdb',
          configuredAvailable: false
        })
      })

      it('never flags unavailable when the provider returns within the grace', async function () {
        const app = makeApp('questdb')
        const registry = makeRegistry(app, TEST_GRACE_MS)
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        registry.unregisterHistoryApiProvider('questdb')
        registry.registerHistoryApiProvider('questdb', provider('questdb'))

        await wait(PAST_GRACE_MS)
        app.serverEvents
          .filter((e) => !e.configuredAvailable)
          .should.deep.equal([])
        lastEvent(app).configuredAvailable.should.equal(true)
      })

      it('clears the unavailable flag when the provider registers again', async function () {
        const app = makeApp('questdb')
        const registry = makeRegistry(app, TEST_GRACE_MS)
        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        registry.unregisterHistoryApiProvider('questdb')
        await wait(PAST_GRACE_MS)
        lastEvent(app).configuredAvailable.should.equal(false)

        registry.registerHistoryApiProvider('questdb', provider('questdb'))
        lastEvent(app).should.deep.equal({
          ids: ['questdb'],
          defaultId: 'questdb',
          configuredId: 'questdb',
          configuredAvailable: true
        })
      })

      it('emits the new state when the default provider is saved', async function () {
        await withDefaultProviderRoute(
          'questdb',
          (cb) => cb(),
          async ({ app, registry, postDefault }) => {
            registry.registerHistoryApiProvider('questdb', provider('questdb'))
            registry.registerHistoryApiProvider('influx', provider('influx'))
            ;(await postDefault('influx')).should.equal(200)
            lastEvent(app).should.deep.equal({
              ids: ['questdb', 'influx'],
              defaultId: 'influx',
              configuredId: 'influx',
              configuredAvailable: true
            })
          }
        )
      })

      it('start() seeds the state event for the replay cache', async function () {
        await withDefaultProviderRoute(
          'questdb',
          (cb) => cb(),
          async ({ app }) => {
            app.serverEvents[0].should.deep.equal({
              ids: [],
              defaultId: undefined,
              configuredId: 'questdb',
              configuredAvailable: true
            })
          }
        )
      })

      it('boot grace flags a configured provider that never registers', async function () {
        await withDefaultProviderRoute(
          'questdb',
          (cb) => cb(),
          async ({ app }) => {
            await wait(PAST_GRACE_MS)
            lastEvent(app).should.deep.equal({
              ids: [],
              defaultId: undefined,
              configuredId: 'questdb',
              configuredAvailable: false
            })
          },
          TEST_GRACE_MS
        )
      })

      it('re-arms the grace when the provider unregisters during the settings write', async function () {
        // The POST route validates the id as registered, but the
        // settings write is asynchronous — the provider can unregister
        // in the gap. The save must not declare it available.
        let registryRef: ReturnType<typeof makeRegistry> | undefined
        await withDefaultProviderRoute(
          'questdb',
          (cb) => {
            if (!registryRef) {
              throw new Error('settings write before the test armed it')
            }
            registryRef.unregisterHistoryApiProvider('influx')
            cb()
          },
          async ({ app, registry, postDefault }) => {
            registryRef = registry
            registry.registerHistoryApiProvider('influx', provider('influx'))
            ;(await postDefault('influx')).should.equal(200)
            lastEvent(app).should.deep.equal({
              ids: [],
              defaultId: undefined,
              configuredId: 'influx',
              configuredAvailable: true
            })
            await wait(PAST_GRACE_MS)
            lastEvent(app).should.deep.equal({
              ids: [],
              defaultId: undefined,
              configuredId: 'influx',
              configuredAvailable: false
            })
          },
          TEST_GRACE_MS
        )
      })
    })

    // Drives the POST default-provider route directly: stubs
    // writeSettingsFile with the given outcome, captures the registry's
    // route handlers and provides a postDefault(id) helper returning the
    // response status code. Restores the stub afterwards.
    const withDefaultProviderRoute = async (
      configuredDefault: string | undefined,
      writeSettings: (cb: (err?: Error) => void) => void,
      run: (ctx: {
        app: TestApp
        registry: ReturnType<typeof makeRegistry>
        postDefault: (id: string) => Promise<number>
      }) => Promise<void>,
      unavailableGraceMs?: number
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const config = require('../dist/config/config')
      const origWriteSettingsFile = config.writeSettingsFile
      config.writeSettingsFile = (
        _app: unknown,
        _settings: unknown,
        cb: (err?: Error) => void
      ) => writeSettings(cb)
      try {
        const app = makeApp(configuredDefault) as TestApp & {
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

        const registry = makeRegistry(app, unavailableGraceMs)
        registry.start()

        const postDefault = async (id: string): Promise<number> => {
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
            { params: { id }, method: 'POST', path: '' },
            res
          )
          return statusCode
        }

        await run({ app, registry, postDefault })
      } finally {
        config.writeSettingsFile = origWriteSettingsFile
      }
    }

    it('clears a stale warning when the default is switched to a registered provider', async function () {
      await withDefaultProviderRoute(
        'questdb',
        (cb) => cb(),
        async ({ app, registry, postDefault }) => {
          registry.registerHistoryApiProvider('kip', provider('kip'))

          // configured questdb is unavailable: first request warns
          await defaultOf(app)
          app.notifications.length.should.equal(1)
          app.notifications[0].state.should.equal('warn')

          // switching the default to the registered kip resolves the
          // situation and must clear the warning
          ;(await postDefault('kip')).should.equal(200)
          app.notifications.length.should.equal(2)
          app.notifications[1].state.should.equal('normal')

          // a later unavailability must warn again, not be swallowed
          registry.unregisterHistoryApiProvider('kip')
          registry.registerHistoryApiProvider('questdb', provider('questdb'))
          await defaultOf(app)
          app.notifications.length.should.equal(3)
          app.notifications[2].state.should.equal('warn')
          app.notifications[2].message.should.contain('kip')
        }
      )
    })

    it('does not change the active provider when persisting fails', async function () {
      await withDefaultProviderRoute(
        undefined,
        (cb) => cb(new Error('disk full')),
        async ({ app, registry, postDefault }) => {
          registry.registerHistoryApiProvider('kip', provider('kip'))
          registry.registerHistoryApiProvider('questdb', provider('questdb'))
          ;(await postDefault('questdb')).should.equal(500)

          // the failed save must not have switched the default nor
          // mutated the persisted settings
          ;(await defaultOf(app)).should.equal(providerContext('kip'))
          chai.expect(app.config.settings.historyApi).to.equal(undefined)
        }
      )
    })
  })
})
