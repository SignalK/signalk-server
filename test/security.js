const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const freeport = require('freeport-promise')
const fetch = require('node-fetch')
const http = require('http')
const WebSocket = require('ws')
const _ = require('lodash')
const {
  WsPromiser,
  startServerP,
  getReadOnlyToken,
  getWriteToken
} = require('./servertestutilities')

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
const LIMITED_USER_NAME = 'testuser'

describe('Security', () => {
  var server, url, port, readToken, writeToken

  before(async function () {
    var securityConfig = {
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

    server = await freeport().then(p => {
      port = p
      url = `http://0.0.0.0:${port}`
      return startServerP(p, true, securityConfig)
    })

    readToken = await getReadOnlyToken(server)
    writeToken = await getWriteToken(server)
  })

  after(async function () {
    await server.stop()
  })

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
        username: LIMITED_USER_NAME,
        password: 'badpassword'
      })
    })
    result.status.should.equal(401)
  })

  it('login works', async function () {
    const writeUserToken = await getWriteToken(server)
    writeUserToken.length.should.equal(151)
    const limitedUserToken = await getReadOnlyToken(server)
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
