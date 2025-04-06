const assert = require('assert')

const freeport = require('freeport-promise')
const Server = require('../dist/')
const fs = require('fs')
const path = require('path')

describe('Demo plugin ', () => {
  it('works', async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = require('path').join(
      __dirname,
      'plugin-test-config'
    )
    const pluginConfig = {
      enabled: true,
      configuration: {
        testOption: 'testValue'
      }
    }

    mkDirSync(path.join(`${__dirname}/plugin-test-config/plugin-config-data`))
    writePluginConfig(pluginConfig)

    const port = await freeport()
    const server = new Server({
      config: { settings: { port } }
    })
    await server.start()
    const plugins = await fetch(`http://0.0.0.0:${port}/skServer/plugins`).then(res =>
      res.json()
    )
    assert(plugins.find(plugin => plugin.id === 'testplugin'))

    const plugin = server.app.plugins.find(plugin => plugin.id === 'testplugin')
    assert(plugin)
    assert(plugin.started)

    const optionsTest = plugin.app.readPluginOptions()
    assert(optionsTest.configuration.testOption === 'testValue')

    assert(server.app.signalk.self.some.path.value === 'someValue')

    const outputValues = []
    server.app.signalk.on('delta', msg => {
      outputValues.push(msg.updates[0].values[0].value)
    })
    server.app.handleMessage('foo', {
      updates: [
        {
          values: [
            {
              path: 'navigation.courseOverGroundTrue',
              value: Math.PI
            }
          ]
        }
      ]
    })
    server.app.handleMessage('foo', {
      updates: [
        {
          values: [
            {
              path: 'navigation.courseOverGroundMagnetic',
              value: 2
            }
          ]
        }
      ]
    })

    pluginConfig.enabled = false
    await postPluginConfig(port, pluginConfig)

    server.app.handleMessage('foo', {
      updates: [
        {
          values: [
            {
              path: 'navigation.courseOverGroundTrue',
              value: 3
            }
          ]
        }
      ]
    })
    assert.equal(outputValues[0], -1)
    assert.equal(outputValues[1], 2)
    assert.equal(outputValues[2], 3)

    await server.stop()
  })

  it('loads ESM plugins', async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = require('path').join(
      __dirname,
      'plugin-test-config'
    )

    const port = await freeport()
    const server = new Server({
      config: { settings: { port } }
    })
    await server.start()

    const plugin = server.app.plugins.find(
      (plugin) => plugin.id === 'esm-plugin'
    )

    assert(plugin)

    await server.stop()
  })
})

function mkDirSync(dirPath) {
  try {
    fs.mkdirSync(dirPath)
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err
    }
  }
}

function writePluginConfig (config) {
  fs.writeFileSync(
    path.join(
      `${__dirname}/plugin-test-config/plugin-config-data/testplugin.json`
    ),
    JSON.stringify(config)
  )
}

async function postPluginConfig (port, config) {
  await fetch(`http://0.0.0.0:${port}/skServer/plugins/testplugin/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  })
}
