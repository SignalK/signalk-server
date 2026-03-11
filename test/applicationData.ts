import chai from 'chai'
// @ts-expect-error no type declarations available
import chaiThings from 'chai-things'
// @ts-expect-error no type declarations available
import chaiJsonEqual from 'chai-json-equal'
import { strict as assert } from 'assert'
import fs from 'fs'
import path from 'path'
import { rimraf } from 'rimraf'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getReadOnlyToken,
  getWriteToken,
  getAdminToken
} from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()
chai.use(chaiThings)
chai.use(chaiJsonEqual)

const APP_ID = 'testApplication'
const APP_VERSION = '1.0.0'

interface TestCase {
  appid: string
  version: string
  settings: { something: number; sometingElse: string }
}

const tests: TestCase[] = [
  {
    appid: 'testApplication',
    version: '1.0.0',
    settings: {
      something: 100,
      sometingElse: 'hello'
    }
  },
  {
    appid: 'testApplication',
    version: '1.1.1',
    settings: {
      something: 111,
      sometingElse: 'hello 111'
    }
  },
  {
    appid: 'anotherApplication',
    version: '2.0.0',
    settings: {
      something: 200,
      sometingElse: 'hello 200'
    }
  }
]

describe('Application Data', () => {
  let url: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let adminToken: string
  let writeToken: string
  let readToken: string
  let readHeaders: Record<string, string>
  let writeHeaders: Record<string, string>
  let adminHeaders: Record<string, string>

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, true)
    readToken = await getReadOnlyToken(server)
    writeToken = await getWriteToken(server)
    adminToken = await getAdminToken(server)

    readHeaders = { Cookie: `JAUTHENTICATION=${readToken}` }
    writeHeaders = { Cookie: `JAUTHENTICATION=${writeToken}` }
    adminHeaders = { Cookie: `JAUTHENTICATION=${adminToken}` }
  })

  beforeEach(async () => {
    await rimraf(
      path.join(
        process.env.SIGNALK_NODE_CONFIG_DIR as string,
        'applicationData'
      )
    )
  })

  after(async () => {
    await server.stop()
  })

  async function post(globalOrUser: boolean, token: string, expected: number) {
    for (const test of tests) {
      const reqUrl = globalOrUser
        ? `${url}/signalk/v1/applicationData/global/${test.appid}/${test.version}`
        : `${url}/signalk/v1/applicationData/user/${test.appid}/${test.version}`
      let result = await fetch(reqUrl, {
        method: 'POST',
        headers: {
          Cookie: `JAUTHENTICATION=${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.settings)
      })
      result.status.should.equal(expected)

      if (globalOrUser) {
        result = await fetch(reqUrl, {
          headers: {
            ...adminHeaders,
            'Content-Type': 'application/json'
          }
        })
        result.status.should.equal(200)
        const data = await result.json()
        if (expected !== 200) {
          data.should.not.jsonEqual(test.settings)
        } else {
          data.should.jsonEqual(test.settings)
        }
      }
    }
  }

  function readUserData(test: TestCase, userName: string) {
    const userPath = path.join(
      process.env.SIGNALK_NODE_CONFIG_DIR as string,
      'applicationData',
      'users',
      userName,
      test.appid,
      `${test.version}.json`
    )

    if (fs.existsSync(userPath)) {
      return JSON.parse(fs.readFileSync(userPath, 'utf8'))
    } else {
      return null
    }
  }

  it('invalid appid or version fails', async function () {
    async function fail(appid: string, version: string) {
      const result = await fetch(
        `${url}/signalk/v1/applicationData/global/${appid}/${version}`,
        { headers: readHeaders }
      )
      result.status.should.equal(400)
    }

    await fail(encodeURIComponent('foo/bar'), '1.0')
    await fail('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '1.0')
    await fail('validApp', 'a.b.c')
  })

  it('fetch global returns empty data', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      { headers: readHeaders }
    )
    result.status.should.equal(200)
    const data = await result.json()
    data.should.jsonEqual({})
  })

  it('post global fails readonly user', async function () {
    await post(true, readToken, 401)
  })

  it('post global fails write user', async function () {
    await post(true, writeToken, 401)
  })

  it('post global works admin user', async function () {
    await post(true, adminToken, 200)
  })

  it('post user data fails readonly user', async function () {
    await post(false, readToken, 401)
    for (const test of tests) {
      const data = readUserData(test, 'testuser')
      assert(data === null)
    }
  })

  it('post user data works', async function () {
    await post(false, writeToken, 200)
    for (const test of tests) {
      const data = readUserData(test, 'writeuser')
      assert(data !== null)
      data.should.jsonEqual(test.settings)
    }
  })

  it('json patch works', async function () {
    for (const test of tests) {
      let result = await fetch(
        `${url}/signalk/v1/applicationData/user/${test.appid}/${test.version}`,
        {
          method: 'POST',
          headers: {
            ...writeHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([
            { op: 'add', path: '/testing', value: test.settings.something }
          ])
        }
      )
      result.status.should.equal(200)

      result = await fetch(
        `${url}/signalk/v1/applicationData/user/${test.appid}/${test.version}/testing`,
        {
          headers: {
            ...writeHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
      result.status.should.equal(200)
      const data = await result.json()
      data.should.equal(test.settings.something)
    }
  })
})

describe('Application Data with allow_readonly and anonymousApplicationDataAccess: none', () => {
  let url: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let adminToken: string
  let adminHeaders: Record<string, string>

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, true, {}, { allow_readonly: true })
    adminToken = await getAdminToken(server)
    adminHeaders = { Cookie: `JAUTHENTICATION=${adminToken}` }
  })

  beforeEach(async () => {
    await rimraf(
      path.join(
        process.env.SIGNALK_NODE_CONFIG_DIR as string,
        'applicationData'
      )
    )
  })

  after(async () => {
    await server.stop()
  })

  it('anonymous GET on global applicationData is blocked', async function () {
    // Write data as admin first
    let result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(200)

    // Anonymous GET should be blocked
    result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(401)
  })

  it('anonymous version listing is blocked', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}`
    )
    result.status.should.equal(401)
  })

  it('admin GET on global applicationData works', async function () {
    let result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(200)

    result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      { headers: adminHeaders }
    )
    result.status.should.equal(200)
    const data = await result.json()
    data.should.jsonEqual({ hello: 'world' })
  })
})

describe('Application Data with anonymousApplicationDataAccess: readonly', () => {
  let url: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let adminToken: string
  let adminHeaders: Record<string, string>

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, true, {
      settings: {
        anonymousApplicationDataAccess: 'readonly'
      }
    })
    adminToken = await getAdminToken(server)
    adminHeaders = { Cookie: `JAUTHENTICATION=${adminToken}` }
  })

  beforeEach(async () => {
    await rimraf(
      path.join(
        process.env.SIGNALK_NODE_CONFIG_DIR as string,
        'applicationData'
      )
    )
  })

  after(async () => {
    await server.stop()
  })

  it('anonymous GET on global applicationData works', async function () {
    // First write data as admin
    let result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(200)

    // Anonymous GET should succeed
    result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(200)
    const data = await result.json()
    data.should.jsonEqual({ hello: 'world' })
  })

  it('anonymous POST on global applicationData fails', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(401)
  })

  it('admin POST on global applicationData works', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(200)
  })

  it('anonymous user applicationData still requires auth', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(401)
  })
})

describe('Application Data without security (default no anonymous access)', () => {
  let url: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, false)
  })

  after(async () => {
    await server.stop()
  })

  it('GET on global applicationData is blocked', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(403)
  })

  it('version listing is blocked', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}`
    )
    result.status.should.equal(403)
  })

  it('POST on global applicationData is blocked', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(405)
  })
})

describe('Application Data with anonymousApplicationDataAccess: readwrite', () => {
  let url: string
  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, true, {
      settings: {
        anonymousApplicationDataAccess: 'readwrite'
      }
    })
  })

  beforeEach(async () => {
    await rimraf(
      path.join(
        process.env.SIGNALK_NODE_CONFIG_DIR as string,
        'applicationData'
      )
    )
  })

  after(async () => {
    await server.stop()
  })

  it('anonymous POST on global applicationData works', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      }
    )
    result.status.should.equal(200)
  })

  it('anonymous GET on global applicationData works', async function () {
    // First write data anonymously
    let result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' })
      }
    )
    result.status.should.equal(200)

    // Anonymous GET should succeed
    result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(200)
    const data = await result.json()
    data.should.jsonEqual({ foo: 'bar' })
  })

  it('anonymous user applicationData still requires auth', async function () {
    const result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/${APP_VERSION}`
    )
    result.status.should.equal(401)
  })
})
