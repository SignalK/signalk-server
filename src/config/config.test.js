const { expect } = require('chai')
const { getConfigDirectory } = require('./config')
const path = require('path')

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
    const theApp = JSON.parse(JSON.stringify(app))
    delete theApp.env.SIGNALK_NODE_CONFIG_DIR
    expect(getConfigDirectory(theApp)).to.equal('/data/signalk-config')
  })
  it('No config setting then defaults to user dir.', () => {
    const theApp = JSON.parse(JSON.stringify(app))
    delete theApp.env.SIGNALK_NODE_CONFIG_DIR
    delete theApp.config.configPath
    expect(getConfigDirectory(theApp)).to.equal('/user/foo/.signalk')
  })
  it('Use the node process dir `appPath` as last resort.', () => {
    const theApp = JSON.parse(JSON.stringify(app))
    delete theApp.env.SIGNALK_NODE_CONFIG_DIR
    delete theApp.config.configPath
    delete theApp.env.HOME
    expect(getConfigDirectory(theApp)).to.equal('/var/node/signalk')
  })
  it('-s overrides configPath with appPath', () => {
    const theApp = JSON.parse(JSON.stringify(app))
    delete theApp.env.SIGNALK_NODE_CONFIG_DIR
    delete theApp.config.configPath
    theApp.argv.s = path.join(
      __dirname,
      '../../settings/n2k-from-file-settings.json'
    )
    expect(getConfigDirectory(theApp)).to.equal(theApp.config.appPath)
  })
})
