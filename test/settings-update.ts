import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applySettingsUpdate, ConfigApp, Settings } from '../src/config/config'

// Minimal app shape applySettingsUpdate / writeSettingsFile need: a config
// dir, argv.s and a live settings object to commit into.
function makeApp(configPath: string, settings: Partial<Settings>): ConfigApp {
  return {
    config: { configPath, settings },
    argv: {}
  } as unknown as ConfigApp
}

function readSettings(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'))
}

describe('applySettingsUpdate', () => {
  let dir: string
  let savedSettingsEnv: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-settings-update-'))
    savedSettingsEnv = process.env.SIGNALK_NODE_SETTINGS
    delete process.env.SIGNALK_NODE_SETTINGS
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (savedSettingsEnv === undefined) {
      delete process.env.SIGNALK_NODE_SETTINGS
    } else {
      process.env.SIGNALK_NODE_SETTINGS = savedSettingsEnv
    }
  })

  describe('whole-settings form', () => {
    it('commits the mutation to memory and disk on success', async () => {
      const app = makeApp(dir, { pipedProviders: [], landingPage: 'old' })
      await applySettingsUpdate(app, (s) => {
        s.landingPage = 'new'
      })
      expect(app.config.settings.landingPage).to.equal('new')
      expect(readSettings(dir).landingPage).to.equal('new')
    })

    it('does not touch live state until the write succeeds', async () => {
      const app = makeApp(dir, { pipedProviders: [], landingPage: 'old' })
      const before = app.config.settings
      const p = applySettingsUpdate(app, (s) => {
        s.landingPage = 'new'
      })
      // The live object is still the pre-update reference/value until commit.
      expect(app.config.settings).to.equal(before)
      expect(app.config.settings.landingPage).to.equal('old')
      await p
      expect(app.config.settings.landingPage).to.equal('new')
    })

    it('leaves memory unchanged when the write fails', async () => {
      // Parent path is a file, so the atomic write cannot create the dir.
      fs.writeFileSync(path.join(dir, 'nope'), 'x')
      const app = makeApp(path.join(dir, 'nope', 'deeper'), {
        pipedProviders: [],
        landingPage: 'old'
      })
      let failed = false
      await applySettingsUpdate(app, (s) => {
        s.landingPage = 'new'
      }).catch(() => {
        failed = true
      })
      expect(failed).to.equal(true)
      expect(app.config.settings.landingPage).to.equal('old')
    })
  })

  describe('subtree-scoped form', () => {
    it('applies an array of key/mutator updates in one write', async () => {
      const app = makeApp(dir, {
        pipedProviders: [],
        landingPage: 'old'
      })
      await applySettingsUpdate(app, [
        {
          key: 'historyApi',
          mutator: () => ({ defaultProvider: 'p1' })
        },
        {
          key: 'landingPage',
          mutator: () => 'new'
        }
      ])
      expect(app.config.settings.historyApi).to.deep.equal({
        defaultProvider: 'p1'
      })
      expect(app.config.settings.landingPage).to.equal('new')
      const onDisk = readSettings(dir)
      expect(onDisk.historyApi).to.deep.equal({ defaultProvider: 'p1' })
      expect(onDisk.landingPage).to.equal('new')
    })

    it('mutating the clone in place does not affect live state before commit', async () => {
      const app = makeApp(dir, {
        pipedProviders: [{ id: 'a' }, { id: 'b' }]
      })
      const live = app.config.settings.pipedProviders
      const p = applySettingsUpdate(app, [
        {
          key: 'pipedProviders',
          mutator: (draft) => {
            draft!.splice(0, 1)
          }
        }
      ])
      // Live array untouched until commit.
      expect(app.config.settings.pipedProviders).to.equal(live)
      expect(app.config.settings.pipedProviders).to.have.length(2)
      await p
      expect(app.config.settings.pipedProviders).to.have.length(1)
      expect(app.config.settings.pipedProviders[0].id).to.equal('b')
    })

    it('keeps the same settings reference (Object.assign, not replace)', async () => {
      const app = makeApp(dir, { pipedProviders: [], landingPage: 'old' })
      const before = app.config.settings
      await applySettingsUpdate(app, [
        { key: 'landingPage', mutator: () => 'new' }
      ])
      expect(app.config.settings).to.equal(before)
      expect(app.config.settings.landingPage).to.equal('new')
    })

    it('leaves memory unchanged when the write fails', async () => {
      fs.writeFileSync(path.join(dir, 'nope'), 'x')
      const app = makeApp(path.join(dir, 'nope', 'deeper'), {
        pipedProviders: [],
        landingPage: 'old'
      })
      let failed = false
      await applySettingsUpdate(app, [
        { key: 'landingPage', mutator: () => 'new' }
      ]).catch(() => {
        failed = true
      })
      expect(failed).to.equal(true)
      expect(app.config.settings.landingPage).to.equal('old')
    })

    it('routes priority keys into priorities.json', async () => {
      const app = makeApp(dir, { pipedProviders: [] })
      await applySettingsUpdate(app, [
        {
          key: 'sourceAliases',
          mutator: () => ({ 'a.b': 'Alias' })
        }
      ])
      const priorities = JSON.parse(
        fs.readFileSync(path.join(dir, 'priorities.json'), 'utf8')
      )
      expect(priorities.sourceAliases).to.deep.equal({ 'a.b': 'Alias' })
      // The priority key must not leak into settings.json.
      expect(readSettings(dir).sourceAliases).to.equal(undefined)
      // In-memory state still carries it.
      expect(app.config.settings.sourceAliases).to.deep.equal({
        'a.b': 'Alias'
      })
    })
  })
})
