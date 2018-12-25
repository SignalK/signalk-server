const { expect } = require('chai')
const { getConfigDirectory } = require('./config')
const { appPath } = require('./get')

const app = {
  argv: {},
  config: {
    appPath: '/var/node/signalk',
    configPath: '/data/signalk-config'
  },
  env: {
    HOME: '/user/foo',
    SIGNALK_NODE_CONFIG_DIR: '/data/signalk/config'
  }
}

describe('getConfigDirectory', () => {
  it('Allow env to overwrite constructor configPath setting.', () => {
    expect(getConfigDirectory(app)).to.equal('/data/signalk/config')
  })
  it('Constructor configPath has priority when no env SK Config Dir.', () => {
    delete app.env.SIGNALK_NODE_CONFIG_DIR
    expect(getConfigDirectory(app)).to.equal('/data/signalk-config')
  })
  it('No config setting then defaults to user dir.', () => {
    delete app.config.configPath
    expect(getConfigDirectory(app)).to.equal('/user/foo/.signalk')
  })
  it('Use the node process dir `appPath` as last resort.', () => {
    delete app.config.configPath
    delete app.env.HOME
    expect(getConfigDirectory(app)).to.equal('/var/node/signalk')
  })
})
