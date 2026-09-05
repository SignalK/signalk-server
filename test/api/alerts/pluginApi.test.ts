import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import { freeport } from '../../ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../../../dist/')

const CONFIG_DIR = path.join(__dirname, '..', '..', 'plugin-test-config')

/**
 * Two plugins, two copies of `app`, one alert subsystem.
 *
 * A plugin that attaches an API to its own `app` copy is invisible to every
 * other plugin — the failure this subsystem is in core to avoid. These plugins
 * only raise; the surface reaching them at all is the assertion.
 */
/** Only what this suite uses of a started server. */
interface RunningServer {
  start: () => Promise<unknown>
  stop: () => Promise<unknown>
}

/** An alert as the list endpoint serves it. */
interface ListedAlert {
  path: string
  $source: string
  message: string
}

/** How long to wait for both plugins to have raised before giving up. */
const RAISE_DEADLINE_MS = 20_000

const POLL_INTERVAL_MS = 25

describe('alerts plugin API', function () {
  let server: RunningServer
  let url: string

  async function listAlerts(): Promise<ListedAlert[]> {
    return (await (
      await fetch(`${url}/signalk/v2/api/alerts`)
    ).json()) as ListedAlert[]
  }

  /**
   * Wait until both plugins' alerts are in the active set.
   *
   * The plugin loader does not await `start()`, so there is no event to hang
   * this on; the active set is the only thing that says the raises landed.
   */
  async function bothPluginsHaveRaised(): Promise<void> {
    const deadline = Date.now() + RAISE_DEADLINE_MS
    for (;;) {
      const paths = new Set((await listAlerts()).map((alert) => alert.path))
      if (
        paths.has('test.plugina.condition') &&
        paths.has('test.pluginb.condition')
      ) {
        return
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Neither plugin raised within ${String(RAISE_DEADLINE_MS)}ms; ` +
            `the active set holds ${[...paths].join(', ') || 'nothing'}.`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  before(async function () {
    // The store survives a run, so a stale alert from an earlier one would
    // let this pass without the plugins raising anything.
    fs.rmSync(path.join(CONFIG_DIR, 'serverState', 'alerts'), {
      recursive: true,
      force: true
    })
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
    const port = await freeport()
    url = `http://127.0.0.1:${port}`
    server = new Server({ config: { settings: { port } } })
    await server.start()
    // The plugin loader does not await start(), so the raises land some time
    // after the server answers. A fixed wait is a bet on how long that takes.
    await bothPluginsHaveRaised()
  })

  after(async function () {
    await server.stop()
    delete process.env.SIGNALK_NODE_CONFIG_DIR
    // The boot writes these into the shared fixture directory; they are
    // runtime state, not fixtures.
    for (const artefact of ['settings.json', 'priorities.json']) {
      fs.rmSync(path.join(CONFIG_DIR, artefact), { force: true })
    }
    fs.rmSync(path.join(CONFIG_DIR, 'serverState', 'alerts'), {
      recursive: true,
      force: true
    })
  })

  it('gives every plugin a working surface, each alert attributed to its plugin', async function () {
    const alerts = await listAlerts()

    const raised = Object.fromEntries(
      alerts.map((alert) => [alert.path, alert])
    )
    expect(Object.keys(raised)).to.include.members([
      'test.plugina.condition',
      'test.pluginb.condition'
    ])
    expect(raised['test.plugina.condition'].$source).to.equal('alertsplugin-a')
    expect(raised['test.pluginb.condition'].$source).to.equal('alertsplugin-b')
  })
})
