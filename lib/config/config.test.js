const { expect } = require('chai')
const { setConfigDirectory } = require('./config')

const app = {
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
