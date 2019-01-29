const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const freeport = require('freeport-promise')
const Server = require('../lib')
const fetch = require('node-fetch')
const http = require('http')
const promisify = require('util').promisify
const WebSocket = require('ws')
const _ = require('lodash')
const { WsPromiser } = require('./servertestutilities')

const limitedSteeringDelta = {
  updates: [
    {
      source: {
        label: 'langford-canboatjs',
        type: 'NMEA2000',
        pgn: 127245,
        src: '204'
      },
      timestamp: '2017-04-15T14:58:44.383Z',
      values: [{ path: 'steering.rudderAngle', value: 0.0081 }]
    }
  ],
  context: 'vessels.self',
  shouldSee: false
}
const openNavigationDelta = {
  updates: [
    {
      source: {
        label: 'langford-canboatjs',
        type: 'NMEA2000',
        pgn: 127251,
        src: '204'
      },
      timestamp: '2017-04-15T14:58:44.377Z',
      values: [{ path: 'navigation.rateOfTurn', value: 0.0018787187 }]
    }
  ],
  context: 'vessels.self',
  shouldSee: true
}

const WRITE_USER_NAME = 'writeuser'
const WRITE_USER_PASSWORD = 'writepass'
const LIMITED_USER_NAME = 'testuser'
const LIMITED_USER_PASSWORD = 'verylimited'
const ADMIN_USER_NAME = 'adminuser'
const ADMIN_USER_PASSWORD = 'adminpass'

describe('Security', () => {
  let server, url, port, readToken, writeToken, adminToken

  before(async function () {
    const securityConfig = {
      allow_readonly: false,
      expiration: '1d',
      allowNewUserRegistration: true,
      allowDeviceAccessRequests: true,
      secretKey:
        '3ad6c2b567c43199e1afd2307ef506ea9fb5f8becada1f86c15213d75124fbaf4647c3f7202b788bba5c01c8bb8fdc52e8ca5bd484be36b6900ac03b88b6063b6157bee1e638acde1936d6ef4717884de63c86e9f50c8ee12b15bf837268b04bc09a461f5dddaf71dfc7205cc549b29810a31515b21d57ac5fdde29628ccff821cfc229004c4864576eb7c238b0cd3a6d774c14854affa1aeedbdb1f47194033f18e50d9dc1171a47e36f26c864080a627c500d1642fc94f71e93ff54022a8d4b00f19e88a0610ef70708ac6a386ba0df7cab201e24d3eb0061ddd0052d3d85cda50ac8d6cafc4ecc43d8db359a85af70d4c977a3d4b0d588f123406dbd57f01',
      users: [],
      acls: [
        {
          context: 'vessels.self',
          resources: [
            {
              paths: ['navigation.*'],
              permissions: [
                {
                  subject: 'any',
                  permission: 'read'
                },
                {
                  subject: WRITE_USER_NAME,
                  permission: 'write'
                }
              ]
            },
            {
              paths: ['steering.*'],
              permissions: [
                {
                  subject: WRITE_USER_NAME,
                  permission: 'write'
                }
              ]
            }
          ]
        }
      ]
    }

    port = await freeport()
    url = `http://0.0.0.0:${port}`
    const serverApp = new Server({
      config: {
        settings: {
          port,
          interfaces: {
            plugins: false
          },
          security: {
            strategy: './tokensecurity'
          }
        }
      },
      securityConfig: securityConfig
    })
    server = await serverApp.start()

    await promisify(server.app.securityStrategy.addUser)(securityConfig, {
      userId: LIMITED_USER_NAME,
      type: 'readwrite',
      password: LIMITED_USER_PASSWORD
    })
    await promisify(server.app.securityStrategy.addUser)(securityConfig, {
      userId: WRITE_USER_NAME,
      type: 'readwrite',
      password: WRITE_USER_PASSWORD
    })
    await promisify(server.app.securityStrategy.addUser)(securityConfig, {
      userId: ADMIN_USER_NAME,
      type: 'admin',
      password: ADMIN_USER_PASSWORD
    })
    readToken = await login(LIMITED_USER_NAME, LIMITED_USER_PASSWORD)
    writeToken = await login(WRITE_USER_NAME, WRITE_USER_PASSWORD)
    adminToken = await login(ADMIN_USER_NAME, ADMIN_USER_PASSWORD)
  })

  after(async function () {
    await server.stop()
  })

  async function login (username, password) {
    const result = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    })
    if (result.status !== 200) {
      throw new Error('Login returned ' + result.status)
    }
    return result.json().then(json => {
      return json.token
    })
  }

  it('unathorized request fails', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`)
    result.status.should.equal(401)
  })

  it('login with bad password fails', async function () {
    const result = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'LIMITED_USER_NAME',
        password: 'badpassword'
      })
    })
    result.status.should.equal(401)
  })

  it('login works', async function () {
    const writeUserToken = await login(WRITE_USER_NAME, WRITE_USER_PASSWORD)
    writeUserToken.length.should.equal(151)
    const limitedUserToken = await login(
      LIMITED_USER_NAME,
      LIMITED_USER_PASSWORD
    )
    limitedUserToken.length.should.equal(149)
  })

  it('authorized read works', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Cookie: `JAUTHENTICATION=${writeToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('admin request fails', async function () {
    const result = await fetch(`${url}/plugins`)
    result.status.should.equal(401)
  })

  it('websockets acls work', async function () {
    const readPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=all&token=${readToken}`
    )
    let msg = await readPromiser.nextMsg()
    JSON.parse(msg)

    const writePromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none&token=${writeToken}`
    )
    msg = await writePromiser.nextMsg()
    JSON.parse(msg)

    const failingReadPromise = readPromiser.nextMsg()
    await writePromiser.send(limitedSteeringDelta)
    const failingResult = await failingReadPromise
    failingResult.should.equal('timeout')

    const succeedingReadPromise = readPromiser.nextMsg()
    await writePromiser.send(openNavigationDelta)
    const succeedingResult = await succeedingReadPromise
    succeedingResult.should.not.equal('timeout')

    const d = JSON.parse(succeedingResult)
    d.updates.length.should.equal(1)
    d.updates[0].values.length.should.equal(1)
    d.updates[0].values[0].path.should.equal(
      openNavigationDelta.updates[0].values[0].path
    )
  })

  it('REST acls work', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Cookie: `JAUTHENTICATION=${readToken}`
      }
    })
    result.status.should.equal(200)
    const json = await result.json()
    json.should.not.have.nested.property('steering.rudderAngle')
    json.should.have.nested.property('navigation.rateOfTurn')
  })

  it('logout works', async function () {
    const result = await fetch(`${url}/signalk/v1/auth/logout`, {
      method: 'PUT',
      credentials: 'include'
    })
    result.status.should.equal(200)
    result.headers.get('set-cookie').startsWith('JAUTHENTICATION=;').should.be
      .true
  })

  it('request after logout fails', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {})
    result.status.should.equal(401)
  })

  it('Device access request and approval works', async function () {
    let result = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId: '1235-45653-343453',
        description: 'My Awesome Sensor',
        permissions: 'readwrite'
      })
    })
    result.status.should.equal(202)
    const requestJson = await result.json()
    requestJson.should.have.property('requestId')
    requestJson.should.have.property('href')

    result = await fetch(`${url}${requestJson.href}`)
    result.status.should.equal(200)
    let json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('PENDING')
    json.should.have.property('requestId')

    result = await fetch(
      `${url}/security/access/requests/1235-45653-343453/approved`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({
          expiration: '1y',
          permissions: 'readwrite'
        })
      }
    )
    result.status.should.equal(200)

    result = await fetch(`${url}${requestJson.href}`)
    result.status.should.equal(200)
    json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')
    json.should.have.property('accessRequest')
    json.accessRequest.should.have.property('permission')
    json.accessRequest.permission.should.equal('APPROVED')
    json.accessRequest.should.have.property('token')

    result = await fetch(`${url}/security/devices`, {
      headers: {
        Cookie: `JAUTHENTICATION=${adminToken}`
      }
    })
    result.status.should.equal(200)
    json = await result.json()
    json.length.should.equal(1)
    json[0].should.have.property('clientId')
    json[0].clientId.should.equal('1235-45653-343453')
    json[0].permissions.should.equal('readwrite')
    json[0].description.should.equal('My Awesome Sensor')
  })

  it('Device access request and denial works', async function () {
    let result = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId: '1235-45653-343455',
        description: 'My Awesome Sensor',
        permissions: 'readwrite'
      })
    })
    result.status.should.equal(202)
    const requestJson = await result.json()
    requestJson.should.have.property('requestId')
    requestJson.should.have.property('href')

    result = await fetch(`${url}${requestJson.href}`)
    result.status.should.equal(200)
    let json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('PENDING')

    result = await fetch(
      `${url}/security/access/requests/1235-45653-343455/denied`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({
          expiration: '1y',
          permissions: 'readwrite'
        })
      }
    )
    result.status.should.equal(200)

    result = await fetch(`${url}${requestJson.href}`)
    json = await result.json()
    json.should.have.property('state')
    json.state.should.equal('COMPLETED')
    json.should.have.property('accessRequest')
    json.accessRequest.should.have.property('permission')
    json.accessRequest.permission.should.equal('DENIED')

    result = await fetch(`${url}/security/devices`, {
      headers: {
        Cookie: `JAUTHENTICATION=${adminToken}`
      }
    })
    json = await result.json()
    json.length.should.equal(1)
  })
})
