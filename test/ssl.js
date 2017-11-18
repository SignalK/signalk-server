const freeport = require('freeport-promise')
const Server = require('../lib')
const fetch = require('node-fetch')
const https = require('https')

const agent = new https.Agent({
  rejectUnauthorized: false
})

describe('SSL', () => {
  it('works', async function () {
    const sslport = await freeport()
    const port = await freeport()
    const serverApp = new Server({
      config: {
        settings: {
          ssl: true,
          port,
          sslport
        }
      }
    })
    const server = await serverApp.start()
    const result = await fetch(`https://0.0.0.0:${sslport}/signalk`, {
      agent
    })
    await server.stop()
  })
})
