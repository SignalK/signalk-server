import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ServerAPI } from '@signalk/server-api'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

describe('Plugin path lookup compatibility', () => {
  let configDir: string
  let stop: () => Promise<void>
  let api: ServerAPI
  let selfContext: string
  let self: Record<string, unknown>

  before(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-path-lookup-'))
    fs.cpSync(
      path.join(__dirname, 'plugin-test-config/node_modules/testplugin'),
      path.join(configDir, 'node_modules/testplugin'),
      { recursive: true }
    )
    fs.mkdirSync(path.join(configDir, 'plugin-config-data'))
    for (const [id, enabled] of [
      ['testplugin', false],
      ['resources-provider', false]
    ]) {
      fs.writeFileSync(
        path.join(configDir, `plugin-config-data/${id}.json`),
        JSON.stringify({ enabled, configuration: {} })
      )
    }
    const server = await startServerP(
      await freeport(),
      false,
      {
        settings: { interfaces: { plugins: true } }
      },
      undefined,
      configDir
    )
    stop = () => server.stop()
    api = server.app.plugins.find(
      (plugin: { id: string }) => plugin.id === 'testplugin'
    ).app
    selfContext = server.app.selfContext
    self = server.app.signalk.self
    server.app.handleMessage('lookup-test', {
      updates: [
        {
          values: Array.from({ length: 600 }, (_, i) => ({
            path: `electrical.batteries.lookup${i}.voltage`,
            value: i
          }))
        }
      ]
    })
  })

  after(async () => {
    if (stop) await stop()
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('reads hundreds of paths through both public APIs', () => {
    for (let i = 0; i < 600; i++) {
      const p = `electrical.batteries.lookup${i}.voltage.value`
      assert.equal(api.getSelfPath(p), i)
      assert.equal(api.getPath(`${selfContext}.${p}`), i)
    }
  })

  it('retains bracket notation and missing-path behaviour', () => {
    assert.equal(
      api.getSelfPath('electrical.batteries["lookup42"].voltage.value'),
      42
    )
    assert.equal(
      api.getPath(
        `${selfContext}.electrical.batteries["lookup42"].voltage.value`
      ),
      42
    )
    assert.equal(api.getSelfPath('electrical.missing.voltage.value'), undefined)
    assert.equal(api.getPath('vessels.missing.navigation.position'), undefined)
  })

  it('preserves literal dotted keys and primitive intermediates', () => {
    self['lookup.compat'] = 'literal'
    self.lookup = {
      compat: 'nested',
      nil: null,
      zero: 0,
      flag: false,
      text: 'boat',
      array: ['first']
    }
    assert.equal(api.getSelfPath('lookup.compat'), 'literal')
    assert.equal(api.getSelfPath('lookup.nil.value'), undefined)
    assert.equal(api.getSelfPath('lookup.zero'), 0)
    assert.equal(api.getSelfPath('lookup.flag'), false)
    assert.equal(api.getSelfPath('lookup.text.length'), 4)
    assert.equal(api.getSelfPath('lookup.array[0]'), 'first')
    assert.equal(api.getSelfPath('lookup.array.0'), 'first')
  })

  it('reads current values after cycling through many distinct paths', () => {
    const values: Record<string, { value: number }> = {}
    self.lookupCache = values
    for (let i = 0; i < 2200; i++) {
      values[`entry${i}`] = { value: i }
      assert.equal(api.getSelfPath(`lookupCache.entry${i}.value`), i)
    }
    values.entry0 = { value: 42 }
    assert.equal(api.getSelfPath('lookupCache.entry0.value'), 42)
  })

  it('retains the merged sources endpoint', () => {
    assert.equal(typeof api.getPath('/sources'), 'object')
  })
})
