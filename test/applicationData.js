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

const APP_ID = 'testApplication'
const APP_VERSION = '1.0'

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
    server = await freeport().then(p => {
      port = p
      url = `http://0.0.0.0:${port}`
      return startServerP(p, true)
    })

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

    let paths = [
      path.join(
        process.env.SIGNALK_NODE_CONDFIG_DIR,
        'applicationData',
        'global'
      ),
      path.join(process.env.SIGNALK_NODE_CONDFIG_DIR, 'applicationData', 'user')
    ]
    paths.forEach(p => {
      if (fs.existsSync(p)) {
        fs.readdirSync(p).forEach(f => {
          fs.unlinkSync(path.join(p, f))
        })
      }
    })
  })

  after(async function () {
    await server.stop()
  })

  it('fetch global returns empty data', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      {
        headers: readHeaders
      }
    )
    result.status.should.equal(200)
    let data = await result.json()
    data.should.jsonEqual({})
  })

  it('post global fails readonly user', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...readHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(TEST_SETTINGS)
      }
    )
    result.status.should.equal(401)
  })

  it('post global fails write user', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...writeHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(TEST_SETTINGS)
      }
    )
    result.status.should.equal(401)
  })

  it('post global works admin user', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(TEST_SETTINGS)
      }
    )
    result.status.should.equal(200)

    result = await fetch(
      `${url}/signalk/v1/applicationData/global/${APP_ID}/:${APP_VERSION}`,
      {
        headers: {
          ...adminHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
    result.status.should.equal(200)
    let data = await result.json()
    data.should.jsonEqual(TEST_SETTINGS)
  })

  it('post user data fails readonly user', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/:${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...readHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          setting: 'on'
        })
      }
    )
    result.status.should.equal(401)
  })

  it('post user data works', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/:${APP_VERSION}`,
      {
        method: 'POST',
        headers: {
          ...writeHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(TEST_SETTINGS)
      }
    )
    result.status.should.equal(200)

    result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/:${APP_VERSION}`,
      {
        headers: {
          ...writeHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
    result.status.should.equal(200)
    let data = await result.json()
    data.should.jsonEqual(TEST_SETTINGS)
  })

  it('json patch works', async function () {
    var result = await fetch(
      `${url}/signalk/v1/applicationData/user/${APP_ID}/:${APP_VERSION}`,
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
      `${url}/signalk/v1/applicationData/user/${APP_ID}/:${APP_VERSION}/testing`,
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
  })
})
