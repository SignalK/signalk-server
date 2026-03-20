import chai from 'chai'
import fs from 'fs'
import path from 'path'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

chai.should()

const FROM = '2025-01-01T00:00:00Z'
const TO = '2025-01-02T00:00:00Z'

function mkDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

describe('History API v2', () => {
  describe('without provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let api: string

    before(async function () {
      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`
      server = await startServerP(port, false)
    })

    after(async function () {
      await server.stop()
    })

    it('returns 501 for /history/values when no provider is registered', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}`
      )
      res.status.should.equal(501)
      const body = await res.json()
      body.should.have.property('error')
    })
  })

  describe('with provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let api: string

    before(async function () {
      process.env.SIGNALK_NODE_CONFIG_DIR = path.join(
        __dirname,
        'plugin-test-config'
      )

      const pluginConfig = {
        enabled: true,
        configuration: {}
      }
      const configDir = path.join(
        __dirname,
        'plugin-test-config',
        'plugin-config-data'
      )
      mkDirSync(configDir)
      fs.writeFileSync(
        path.join(configDir, 'testplugin.json'),
        JSON.stringify(pluginConfig)
      )

      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`

      server = new Server({
        config: { settings: { port } }
      })
      await server.start()
    })

    after(async function () {
      await server.stop()
    })

    it('lists testplugin as default provider', async function () {
      const res = await fetch(`${api}/history/_providers`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.have.property('testplugin')
      body.testplugin.isDefault.should.equal(true)
    })

    it('returns values from the provider', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&resolution=60`
      )
      res.status.should.equal(200)
      const body = await res.json()
      body.should.have.property('context')
      body.should.have.property('range')
      body.should.have.property('values')
      body.should.have.property('data')
      body.data.length.should.be.greaterThan(0)
    })

    it('returns paths from the provider', async function () {
      const res = await fetch(`${api}/history/paths?from=${FROM}&to=${TO}`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.be.an('array')
      body.should.include('navigation.position')
    })

    it('returns contexts from the provider', async function () {
      const res = await fetch(`${api}/history/contexts?from=${FROM}&to=${TO}`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.be.an('array')
      body.should.include('vessels.self')
    })

    it('returns 400 when paths is missing', async function () {
      const res = await fetch(`${api}/history/values?from=${FROM}&to=${TO}`)
      res.status.should.equal(400)
    })
  })
})
