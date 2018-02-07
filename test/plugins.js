const assert = require('assert')

const fetch = require('node-fetch')
const freeport = require('freeport-promise')
const rp = require('request-promise')
const Server = require('../lib/')

describe('Demo plugin ', () => {
  it('works', async () => {
    process.env.SIGNALK_NODE_CONDFIG_DIR = require('path').join(
      __dirname,
      'plugin-test-config'
    )

    const port = await freeport()
    const server = new Server({
      config: { settings: { port } }
    })
    await server.start()
    const plugins = await fetch(`http://0.0.0.0:${port}/plugins`).then(res =>
      res.json()
    )

    assert(plugins.find(plugin => plugin.id === 'testplugin'))

    var plugin = server.app.plugins.find(plugin => plugin.id === 'testplugin')
    assert(plugin)
    assert(plugin.started)

    var optionsTest = plugin.app.readPluginOptions()
    assert(optionsTest.configuration.testOption === 'testValue')

    assert(server.app.signalk.self.some.path.value === 'someValue')

    await server.stop()
  })
})
