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

describe('Security', () => {
  var server, url, port, readToken, writeToken

  before(async function () {
    var securityConfig = {
      allow_readonly: false,
      expiration: '1d',
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
    const serverApp = new Server(
      {
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
        }
      },
      securityConfig
    )
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
    readToken = await login(LIMITED_USER_NAME, LIMITED_USER_PASSWORD)
    writeToken = await login(WRITE_USER_NAME, WRITE_USER_PASSWORD)
  })

  after(async function () {
    await server.stop()
  })

  async function login (username, password) {
    const result = await fetch(`${url}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    })
    if (result.status != 200) {
      throw new Error('Login returned ' + result.status)
    }
    return result.json().then(json => {
      console.log(json)
      return json.token
    })
  }

  it('unathorized request fails', async function () {
    var result = await fetch(`${url}/signalk/v1/api/vessels/self`)
    result.status.should.equal(401)
  })

  it('login with bad password fails', async function () {
    var result = await fetch(`${url}/login`, {
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
    var result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Cookie: `JAUTHENTICATION=${writeToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('admin request fails', async function () {
    var result = await fetch(`${url}/plugins`)
    result.status.should.equal(401)
  })

  it('websockets acls work', async function () {
    var readPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=all&token=${readToken}`
    )
    var msg = await readPromiser.nextMsg()
    JSON.parse(msg)

    var writePromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none&token=${writeToken}`
    )
    msg = await writePromiser.nextMsg()
    JSON.parse(msg)

    let failingReadPromise = readPromiser.nextMsg()
    await writePromiser.send(limitedSteeringDelta)
    let failingResult = await failingReadPromise
    failingResult.should.equal('timeout')

    let succeedingReadPromise = readPromiser.nextMsg()
    await writePromiser.send(openNavigationDelta)
    let succeedingResult = await succeedingReadPromise
    succeedingResult.should.not.equal('timeout')

    var d = JSON.parse(succeedingResult)
    d.updates.length.should.equal(1)
    d.updates[0].values.length.should.equal(1)
    d.updates[0].values[0].path.should.equal(
      openNavigationDelta.updates[0].values[0].path
    )
  })

  it('REST acls work', async function () {
    var result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Cookie: `JAUTHENTICATION=${readToken}`
      }
    })
    result.status.should.equal(200)
    var json = await result.json()
    json.should.not.have.nested.property('steering.rudderAngle')
    json.should.have.nested.property('navigation.rateOfTurn')
  })

  it('logout works', async function () {
    var result = await fetch(`${url}/logout`, {
      method: 'PUT',
      credentials: 'include'
    })
    result.status.should.equal(200)
    result.headers.get('set-cookie').startsWith('JAUTHENTICATION=;').should.be
      .true
  })

  it('request after logout fails', async function () {
    var result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      credentials: 'include'
    })
    result.status.should.equal(401)
  })
})

// Connects to the url via ws
// and provides Promises that are either resolved within
// timeout period as the next message from the ws or
// the string "timeout" in case timeout fires
function WsPromiser (url) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
}

WsPromiser.prototype.nextMsg = function () {
  const callees = this.callees
  return new Promise((resolve, reject) => {
    callees.push(resolve)
    setTimeout(_ => {
      resolve('timeout')
    }, 250)
  })
}

WsPromiser.prototype.onMessage = function (message) {
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach(callee => callee(message))
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve, reject) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}
