const assert = require('assert')

const { freeport } = require('./ts-servertestutilities')
const Server = require('../dist/')
const { DeviceTracker } = require('../dist/deviceTracker')
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
    const plugins = await fetch(`http://0.0.0.0:${port}/skServer/plugins`).then(
      (res) => res.json()
    )
    assert(plugins.find((plugin) => plugin.id === 'testplugin'))

    const plugin = server.app.plugins.find(
      (plugin) => plugin.id === 'testplugin'
    )
    assert(plugin)
    assert(plugin.started)

    const optionsTest = plugin.app.readPluginOptions()
    assert(optionsTest.configuration.testOption === 'testValue')

    assert(server.app.signalk.self.some.path.value === 'someValue')

    const outputValues = []
    server.app.signalk.on('delta', (msg) => {
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

  it('keeps a throwing device state callback out of connection handling', async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = path.join(
      __dirname,
      'plugin-test-config'
    )
    mkDirSync(path.join(`${__dirname}/plugin-test-config/plugin-config-data`))
    writePluginConfig({
      enabled: true,
      configuration: { testOption: 'testValue' }
    })

    const port = await freeport()
    const server = new Server({
      config: { settings: { port } }
    })
    await server.start()
    // The tracker exists only with security enabled; the plugin API looks
    // it up when the callback is registered.
    server.app.deviceTracker = new DeviceTracker(() => {})
    const pluginErrors = []
    server.app.setPluginError = (id, message) =>
      pluginErrors.push({ id, message })
    const plugin = server.app.plugins.find(
      (plugin) => plugin.id === 'testplugin'
    )

    try {
      plugin.app.onDeviceStateChange(() => {
        throw new Error('callback failed')
      })
      assert.doesNotThrow(() => server.app.deviceTracker.onConnect('device-1'))
      assert.deepEqual(pluginErrors, [
        { id: 'testplugin', message: 'Runtime error: callback failed' }
      ])
      assert(server.app.deviceTracker.getState('device-1').isConnected)
    } finally {
      server.app.deviceTracker.destroy()
      await server.stop()
    }
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

function writePluginConfig(config) {
  fs.writeFileSync(
    path.join(
      `${__dirname}/plugin-test-config/plugin-config-data/testplugin.json`
    ),
    JSON.stringify(config)
  )
}

async function postPluginConfig(port, config) {
  await fetch(`http://0.0.0.0:${port}/skServer/plugins/testplugin/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  })
}
