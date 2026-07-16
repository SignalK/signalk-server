import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import '../dist/host-modules.js'
import { importOrRequire } from '../dist/modules.js'

function writeModule(dir: string, pkg: object, files: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
}

describe('host-provided modules', () => {
  let testDir: string | undefined
  let plugin: {
    serverApi: Record<string, unknown>
    historyApi: Record<string, unknown>
    deep: { BUNDLED_STALE_COPY?: boolean }
    bacon: Record<string, unknown>
  }

  before(async () => {
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), '_skservertest_host_modules')
    )
    const pluginDir = path.join(testDir, 'node_modules', 'testplugin')
    writeModule(
      pluginDir,
      { name: 'testplugin', version: '1.0.0', main: 'index.js' },
      {
        'index.js': `module.exports = {
          serverApi: require('@signalk/server-api'),
          historyApi: require('@signalk/server-api/history'),
          deep: require('@signalk/server-api/deep.js'),
          bacon: require('baconjs')
        }`
      }
    )
    // stale bundled copy without an exports map, like server-api 2.9.x
    writeModule(
      path.join(pluginDir, 'node_modules', '@signalk', 'server-api'),
      { name: '@signalk/server-api', version: '0.0.1', main: 'index.js' },
      {
        'index.js': `module.exports = { BUNDLED_STALE_COPY: true }`,
        'history.js': `module.exports = { BUNDLED_STALE_COPY: true }`,
        'deep.js': `module.exports = { BUNDLED_STALE_COPY: true }`
      }
    )
    writeModule(
      path.join(pluginDir, 'node_modules', 'baconjs'),
      { name: 'baconjs', version: '0.0.1', main: 'index.js' },
      { 'index.js': `module.exports = { BUNDLED_STALE_COPY: true }` }
    )
    plugin = await importOrRequire(pluginDir)
  })

  after(() => {
    if (testDir !== undefined) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('plugin bundling its own @signalk/server-api gets the host copy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(plugin.serverApi).to.equal(require('@signalk/server-api'))
    expect(plugin.serverApi.BUNDLED_STALE_COPY).to.equal(undefined)
  })

  it('exported subpaths resolve to the host copy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(plugin.historyApi).to.equal(require('@signalk/server-api/history'))
    expect(plugin.historyApi.BUNDLED_STALE_COPY).to.equal(undefined)
  })

  it('subpaths the host copy does not export resolve normally', () => {
    expect(plugin.deep.BUNDLED_STALE_COPY).to.equal(true)
  })

  it('plugin bundling its own baconjs gets the host copy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(plugin.bacon).to.equal(require('baconjs'))
    expect(plugin.bacon.BUNDLED_STALE_COPY).to.equal(undefined)
  })
})
