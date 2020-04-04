const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
chai.use(require('chai-json-equal'))
const fetch = require('node-fetch')
const freeport = require('freeport-promise')
const {
  startServerP,
  getReadOnlyToken,
  getWriteToken,
  getAdminToken
} = require('./servertestutilities')
const fs = require('fs')
const promisify = require('util').promisify
const path = require('path')
const assert = require('assert')
const rimraf = require('rimraf')

const APP_ID = 'testApplication'
const APP_VERSION = '1.0.0'

const TEST_SETTINGS = {
  something: 100,
  sometingElse: 'hello'
}

describe('Application Data', () => {
  var server,
    url,
    port,
    adminToken,
    writeToken,
    readToken,
    readHeaders,
    writeHeaders,
    adminHeaders

  before(async function () {
    this.timeout(5000)
    port = await freeport()
    url = `http://0.0.0.0:${port}`
  })

  async function start() {
    let server = await startServerP(port, true)

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

    await new Promise((resolve, reject) => {
      rimraf(path.join(
        process.env.SIGNALK_NODE_CONFIG_DIR,
        'applicationData'), error => {
          if ( error ) {
            reject(error)
          } else {
            resolve()
          }
        })
    })
    
    return server
  }

  async function post(globalOrUser, token, expected) {
    let server = await start()
    try {
      const req = globalOrUser ?
            `${url}/signalk/v1/applicationData/global/${APP_ID}/${APP_VERSION}` :
            `${url}/signalk/v1/applicationData/user/${APP_ID}/${APP_VERSION}`
      var result = await fetch(
        req,
        {
          method: 'POST',
          headers: {
            Cookie: `JAUTHENTICATION=${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(TEST_SETTINGS)
        }
      )
      result.status.should.equal(expected)

      if ( globalOrUser ) {
        result = await fetch(
          req,
          {
            headers: {
              ...adminHeaders,
              'Content-Type': 'application/json'
            }
          }
        )
        result.status.should.equal(200)
        let data = await result.json()
        if ( expected !== 200 ) {
          data.should.not.jsonEqual(TEST_SETTINGS)
        } else {
          data.should.jsonEqual(TEST_SETTINGS)
        }
      }
    } finally {
      await server.stop()
    }
  }

  function readUserData(userName) {
    const userPath = path.join(process.env.SIGNALK_NODE_CONFIG_DIR, 'applicationData', 'users', userName, APP_ID, `${APP_VERSION}.json`)

    if ( fs.existsSync(userPath) ) {
      return JSON.parse(fs.readFileSync(userPath))
    } else {
      return null
    }
  }

  it('invalid appid or version fails', async function () {
    let server = await start()

    async function fail(appid, version) {
      var result = await fetch(
        `${url}/signalk/v1/applicationData/global/${appid}/${version}`,
        {
          headers: readHeaders
        }
      )
      result.status.should.equal(400)
    }
    
    try {
      await fail('foo/bar', '1.0')
      await fail('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1.0)
      await fail('validApp', 'a.b.c')
      await fail('validApp', 'a.b.c')
    } finally {
      await server.stop()
    }
  })

  it('fetch global returns empty data', async function () {
    let server = await start()
    try {
      var result = await fetch(
        `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
        {
          headers: readHeaders
        }
      )
      result.status.should.equal(200)
      let data = await result.json()
      data.should.jsonEqual({})
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
    const data = readUserData('testuser')
    assert(data === null)
  })

  it('post user data works', async function () {
    await post(false, writeToken, 200)
    const data = readUserData('writeuser')
    assert(data !== null)
    data.should.jsonEqual(TEST_SETTINGS)
  })

  it('json patch works', async function () {
    let server = await start()
    try {
      var result = await fetch(
        `${url}/signalk/v1/applicationData/user/${APP_ID}/${APP_VERSION}`,
        {
          method: 'POST',
          headers: {
            ...writeHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([
            { op: 'add', path: '/testing', value: 'Hello World' }
          ])
        }
      )
      result.status.should.equal(200)
      
      result = await fetch(
        `${url}/signalk/v1/applicationData/user/${APP_ID}/${APP_VERSION}/testing`,
        {
          headers: {
            ...writeHeaders,
          'Content-Type': 'application/json'
          }
        }
      )
      result.status.should.equal(200)
      let data = await result.json()
      data.should.equal('Hello World')
    } finally {
      await server.stop()
    }
  })
})
