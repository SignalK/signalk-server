import assert from 'assert'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')

describe('Plugin urlencoded POST bodies without security', () => {
  const originalConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR

  before(() => {
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
  })

  after(() => {
    if (originalConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = originalConfigDir
    }
  })

  it('parses urlencoded POST bodies on plugin routes', async () => {
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })

    await server.start()
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/skServer/plugins/testplugin/echoBody`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'value=hello'
        }
      )
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { value: 'hello' })
    } finally {
      await server.stop()
    }
  })
})
