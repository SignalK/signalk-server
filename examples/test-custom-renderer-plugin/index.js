/**
 * Signal K plugin that provides:
 * 1. A custom Data Browser renderer for testing
 * 2. An embedded webapp for testing Module Federation
 */
module.exports = function (app) {
  const plugin = {
    id: 'signalk-test-custom-renderer',
    name: 'Test Custom Renderer',
    description: 'Test plugin for custom Data Browser renderer and embedded webapp'
  }

  plugin.start = function (options) {
    const path = require('path')

    // Serve the webpack-built Module Federation files
    app.use(
      '/signalk-test-custom-renderer',
      require('express').static(path.join(__dirname, 'public'))
    )

    // Set up a test value with custom renderer metadata
    const testPath = 'environment.test.customRendererValue'

    // Send an initial value
    app.handleMessage(plugin.id, {
      updates: [
        {
          values: [
            {
              path: testPath,
              value: 42
            }
          ]
        }
      ]
    })

    // Set the meta to use our custom renderer
    app.handleMessage(plugin.id, {
      updates: [
        {
          meta: [
            {
              path: testPath,
              value: {
                displayName: 'Test Custom Renderer Value',
                description: 'A test value rendered with a custom plugin renderer',
                renderer: {
                  module: 'signalk-test-custom-renderer',
                  name: './TestRenderer'
                }
              }
            }
          ]
        }
      ]
    })

    // Update the value periodically to show it's live
    plugin.interval = setInterval(() => {
      const newValue = Math.random() * 150
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path: testPath,
                value: newValue
              }
            ]
          }
        ]
      })
    }, 5000)

    app.debug('Test custom renderer plugin started')
  }

  plugin.stop = function () {
    if (plugin.interval) {
      clearInterval(plugin.interval)
    }
  }

  plugin.schema = {
    type: 'object',
    properties: {}
  }

  return plugin
}
