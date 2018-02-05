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
    const plugins = await fetch(`http://0.0.0.0:${port}/plugins`).then(r =>
      r.json()
    )
    await server.stop()
  })
})
