import chai from 'chai'
import fs from 'fs'
import path from 'path'
import { Value } from '@sinclair/typebox/value'
import { type TSchema, FormatRegistry } from '@sinclair/typebox'
import {
  ValuesResponseSchema,
  HistoryProvidersResponseSchema
} from '@signalk/server-api/typebox'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

chai.should()

FormatRegistry.Set('date-time', (value) => !isNaN(Date.parse(value)))

const FROM = '2025-01-01T00:00:00Z'
const TO = '2025-01-02T00:00:00Z'

function assertSchema(schema: TSchema, value: unknown, name: string) {
  const valid = Value.Check(schema, value)
  if (!valid) {
    const errors = [...Value.Errors(schema, value)]
    chai.assert.fail(
      `${name} validation failed:\n${JSON.stringify(errors, null, 2)}`
    )
  }
}

function mkDirSync(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

describe('History API v2', () => {
  describe('without provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let api: string
    let origConfigDir: string | undefined

    before(async function () {
      origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`
      server = await startServerP(port, false)
    })

    after(async function () {
      await server.stop()
      if (origConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
      }
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
    let origConfigDir: string | undefined
    let pluginConfigFile: string

    before(async function () {
      origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
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
      pluginConfigFile = path.join(configDir, 'testplugin.json')
      fs.writeFileSync(pluginConfigFile, JSON.stringify(pluginConfig))

      const port = await freeport()
      api = `http://localhost:${port}/signalk/v2/api`

      server = new Server({
        config: { settings: { port } }
      })
      await server.start()
    })

    after(async function () {
      await server.stop()
      if (fs.existsSync(pluginConfigFile)) {
        fs.unlinkSync(pluginConfigFile)
      }
      if (origConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
      }
    })

    it('lists testplugin as default provider', async function () {
      const res = await fetch(`${api}/history/_providers`)
      res.status.should.equal(200)
      const body = await res.json()
      assertSchema(
        HistoryProvidersResponseSchema,
        body,
        'HistoryProvidersResponse'
      )
      body.testplugin.isDefault.should.equal(true)
    })

    it('returns the default provider id', async function () {
      const res = await fetch(`${api}/history/_providers/_default`)
      res.status.should.equal(200)
      const body = await res.json()
      body.should.have.property('id', 'testplugin')
    })

    it('returns values from the provider', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&from=${FROM}&to=${TO}&resolution=60`
      )
      res.status.should.equal(200)
      const body = await res.json()
      assertSchema(ValuesResponseSchema, body, 'ValuesResponse')
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
      const body = await res.json()
      body.should.have.property('error')
      body.error.should.contain('paths')
    })

    it('accepts an ISO 8601 duration string', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=PT15M`
      )
      res.status.should.equal(200)
    })

    it('accepts an integer number of seconds for duration', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=900`
      )
      res.status.should.equal(200)
    })

    it('returns 400 for an unparseable duration', async function () {
      const res = await fetch(
        `${api}/history/values?paths=navigation.position&duration=not-a-duration`
      )
      res.status.should.equal(400)
      const body = await res.json()
      // Match against the specific error from the parser, not just any
      // mention of "duration", to avoid false greens from unrelated
      // validators that also mention the word.
      body.error.should.contain('ISO 8601')
    })
  })
})
