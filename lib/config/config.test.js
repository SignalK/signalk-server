const path = require('path')
const { expect } = require('chai')
const { readSettingsFile } = require('./config')
const { appPath } = require('./get')

describe('readSettingsFile', () => {
  const app = {
    argv: {},
    config: {
      configPath: '/data/signalk-config'
    }
  }
  it('Does not load file when disableWriteSettings.', () => {
    app.config.disableWriteSettings = true
    expect(readSettingsFile(app)).to.eql({ filename: null })
  })
  it('Tries to load file when disableWriteSetting=false.', () => {
    app.config.disableWriteSettings = false
    expect(readSettingsFile(app)).to.eql({
      filename: '/data/signalk-config/settings.json'
    })
  })
  it('Loads file when disableWriteSetting=false and file found.', () => {
    app.config.disableWriteSettings = false
    app.config.configPath = path.join(appPath, 'settings')
    const res = readSettingsFile(app)
    expect(res.vessel.name).to.equal('Volare')
    expect(res.filename.endsWith('settings/settings.json')).to.equal(true)
  })
  console.log()
})
