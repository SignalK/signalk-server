const { expect } = require('chai')
const { load, readSettingsFile, setConfigDirectory } = require('./config')
const { appPath } = require('./get')

const app = {
  argv: {},
  config: {
    appPath: '/var/node/signalk',
    configPath: '/data/signalk-config'
  },
  env: {
    HOME: '/user/foo'
  }
}

setConfigDirectory(app)
describe('setConfigDirectory', () => {
  it('does not overwrite configPath if set previously.', () => {
    expect(app.config.configPath).to.equal('/data/signalk-config')
  })
  it('defaults to user dir', () => {
    delete app.config.configPath
    setConfigDirectory(app)
    expect(app.config.configPath).to.equal('/user/foo/.signalk')
  })
  it('process dir is last', () => {
    delete app.config.configPath
    delete app.env.HOME
    setConfigDirectory(app)
    expect(app.config.configPath).to.equal('/var/node/signalk')
  })
})

describe('readSettingsFile', () => {
  it('adds default config.settings', () => {
    app.config.configPath = '/foo'
    readSettingsFile(app)
    expect(app.config.settings.filename).to.equal('settings.json')
    expect(app.config.settings.filepath).to.equal('/foo/settings.json')
  })
  it('loads up a settings file', () => {
    app.config.configPath = appPath
    app.config.settings = {
      loadFiles: true,
      filename: 'settings/settings.json',
      pipedProviders: [{}, { id: 'foo' }],
      vessel: { foo: 'bar' }
    }
    readSettingsFile(app)
    // console.log(app.config.settings)
    expect(app.config.settings.pipedProviders[0].id).to.equal('nmeaFromFile')
    expect(app.config.settings.pipedProviders[1].id).to.equal('foo')
    expect(app.config.settings.vessel.name).to.equal('Volare')
    expect(app.config.settings.vessel.foo).to.equal('bar')
  })
  it('ignores file if noFiles true', () => {
    app.config.configPath = appPath
    app.config.settings = {
      filename: 'settings/settings.json',
      pipedProviders: [{}, { id: 'foo' }],
      vessel: { foo: 'bar' }
    }
    readSettingsFile(app)
    // console.log(app.config.settings)
    expect(app.config.settings.pipedProviders[0].id).to.equal(undefined)
    expect(app.config.settings.pipedProviders[1].id).to.equal('foo')
    expect(app.config.settings.vessel.name).to.equal(undefined)
    expect(app.config.settings.vessel.foo).to.equal('bar')
  })
  it('SIGNALK_NODE_SETTINGS overrides', () => {
    app.env.SIGNALK_NODE_SETTINGS = '/foo/sk/bar.json'
    readSettingsFile(app)
    expect(app.config.settings.filepath).to.equal('/foo/sk/bar.json')
  })
})
describe('load', () => {
  const app = { get: () => {} }
  load(app)
  it('Loads package.json and attaches name', () => {
    expect(app.config.name).to.equal('signalk-server')
  })
  console.log(app)
})
