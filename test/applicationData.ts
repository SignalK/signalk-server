import { use, expect } from 'chai'
import chaiThings from 'chai-things'
import fetch from 'node-fetch'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getReadOnlyToken,
  getWriteToken,
  getAdminToken
} from './servertestutilities'
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { rimraf } from 'rimraf'

use(chaiThings)

const APP_ID = 'testApplication'
const APP_VERSION = '1.0.0'

const tests = [
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

type Headers = { [key: string]: string }

describe('Application Data', () => {
  let url: string
  let port: number
  let adminToken: string
  let writeToken: string
  let readToken: string
  let readHeaders: Headers
  let writeHeaders: Headers
  let adminHeaders: Headers

  before(async function () {
    this.timeout(5000)
    port = await freeport()
    url = `http://0.0.0.0:${port}`
  })

  async function start() {
    const server = await startServerP(port, true)

    readToken = await getReadOnlyToken(server)
    writeToken = await getWriteToken(server)
    adminToken = await getAdminToken(server)

    readHeaders = {
      Cookie: `JAUTHENTICATION=${readToken}`
    }
    writeHeaders = {
      Cookie: `JAUTHENTICATION=${writeToken}`
    }
    adminHeaders = {
      Cookie: `JAUTHENTICATION=${adminToken}`
    }

    await rimraf(
      path.join(process.env.SIGNALK_NODE_CONFIG_DIR!, 'applicationData')
    )

    return server
  }

  async function post(
    globalOrUser: boolean,
    token: string,
    expectedStatus: number
  ) {
    const server = await start()
    try {
      for (const test of tests) {
        const req = globalOrUser
          ? `${url}/signalk/v1/applicationData/global/${test.appid}/${test.version}`
          : `${url}/signalk/v1/applicationData/user/${test.appid}/${test.version}`
        let result = await fetch(req, {
          method: 'POST',
          headers: {
            Cookie: `JAUTHENTICATION=${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(test.settings)
        })
        expect(result.status).to.equal(expectedStatus)

        if (globalOrUser) {
          result = await fetch(req, {
            headers: {
              ...adminHeaders,
              'Content-Type': 'application/json'
            }
          })
          expect(result.status).to.equal(200)
          const data = await result.json()
          if (expectedStatus !== 200) {
            expect(data).to.not.eql(test.settings)
          } else {
            expect(data).to.eql(test.settings)
          }
        }
      }
    } finally {
      console.log('stop')
      await server.stop()
    }
  }

  function readUserData(test: (typeof tests)[number], userName: string) {
    const userPath = path.join(
      process.env.SIGNALK_NODE_CONFIG_DIR!,
      'applicationData',
      'users',
      userName,
      test.appid,
      `${test.version}.json`
    )

    if (fs.existsSync(userPath)) {
      return JSON.parse(fs.readFileSync(userPath).toString())
    } else {
      return null
    }
  }

  it('invalid appid or version fails', async function () {
    const server = await start()

    async function fail(appid: string, version: string | number) {
      const result = await fetch(
        `${url}/signalk/v1/applicationData/global/${appid}/${version}`,
        {
          headers: readHeaders
        }
      )
      expect(result.status).to.equal(400)
    }

    try {
      await fail('foo/bar', '1.0')
      await fail('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1.0)
      await fail('validApp', 'a.b.c')
    } finally {
      await server.stop()
    }
  })

  it('fetch global returns empty data', async function () {
    const server = await start()
    try {
      const result = await fetch(
        `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
        {
          headers: readHeaders
        }
      )
      expect(result.status).to.equal(200)
      const data = await result.json()
      expect(data).to.eql({})
    } finally {
      await server.stop()
    }
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
      expect(data).to.eql(test.settings)
    }
  })

  it('json patch works', async function () {
    const server = await start()
    try {
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
        expect(result.status).to.equal(200)

        result = await fetch(
          `${url}/signalk/v1/applicationData/user/${test.appid}/${test.version}/testing`,
          {
            headers: {
              ...writeHeaders,
              'Content-Type': 'application/json'
            }
          }
        )
        expect(result.status).to.equal(200)
        const data = await result.json()
        expect(data).to.equal(test.settings.something)
      }
    } finally {
      await server.stop()
    }
  })
})
