const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const { freeport } = require('./ts-servertestutilities')
const WebSocket = require('ws')
const {
  startServerP,
  getReadOnlyToken,
  getWriteToken,
  getAdminToken,
  WRITE_USER_NAME,
  WRITE_USER_PASSWORD,
  LIMITED_USER_NAME,
  LIMITED_USER_PASSWORD,
  WsPromiser,
  getToken,
  NOPASSWORD_USER_NAME
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

const metaDelta = {
  context: 'vessels.self',
  updates: [
    {
      meta: [
        {
          path: 'navigation.rateOfTurn',
          value: {
            displayName: 'Rate Of Turn'
          }
        }
      ]
    }
  ]
}

describe('Security', () => {
  let server, url, port, readToken, writeToken, adminToken, noPasswordToken

  before(async function () {
    this.timeout(5000)
    const securityConfig = {
      allowNewUserRegistration: true,
      allowDeviceAccessRequests: true,
      allow_readonly: false,
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

    server = await startServerP(
      port,
      true,
      {
        disableSchemaMetaDeltas: true
      },
      securityConfig
    )

    readToken = await getReadOnlyToken(server)
    writeToken = await getWriteToken(server)
    adminToken = await getAdminToken(server)
    noPasswordToken = await getToken(server, NOPASSWORD_USER_NAME)
  })

  after(async function () {
    await server.stop()
  })

  async function login(username, password) {
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
    return result.json().then((json) => {
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

  it('login without password to user without password fails', async function () {
    const result = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: NOPASSWORD_USER_NAME
      })
    })
    result.status.should.equal(401)
  })

  it('login with incorrect password to user without password fails', async function () {
    const result = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: NOPASSWORD_USER_NAME,
        password: 'incorrect'
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

  it('authorized read with Authorization header works', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Authorization: `JWT ${readToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('authorized read with X-Authorization header works', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        'X-Authorization': `JWT ${readToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('authorized read works for user without password', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Cookie: `JAUTHENTICATION=${noPasswordToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('authorized read with Authorization header works for user without password', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        Authorization: `JWT ${noPasswordToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('authorized read with X-Authorization header works for user without password', async function () {
    const result = await fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: {
        'X-Authorization': `JWT ${noPasswordToken}`
      }
    })
    result.status.should.equal(200)
  })

  it('admin request fails', async function () {
    const result = await fetch(`${url}/skServer/plugins`)
    result.status.should.equal(401)
  })

  it('websocket with no token returns only hello', async function () {
    //send some data semisynchronously, so that there is data in the cache that
    //should not appear
    const writePromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none&metaDeltas=none&token=${writeToken}`
    )
    const msg = await writePromiser.nextMsg()
    JSON.parse(msg)
    await writePromiser.send(openNavigationDelta)

    const result = new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://0.0.0.0:${port}/signalk/v1/stream`)
      let msgCount = 0
      ws.on('message', (msg) => {
        msgCount++
        const parsed = JSON.parse(msg)
        if (!parsed.self) {
          reject(
            `ws returned non-hello data:${msg} with allow_readonly set to false`
          )
        }
      })
      ws.on('connect', () => {
        // send some data now that non-authenticated client is connected
        writePromiser.send(openNavigationDelta)
      })
      setTimeout(() => {
        if (msgCount > 1) {
          reject(
            `ws returned ${msgCount} messages, expected only hello with allow_readonly set to false`
          )
        } else {
          resolve()
        }
      }, 250)
    })
    return result
  })

  it('websocket with mangled token returns 401', async () => {
    console.log(readToken)
    return fetch(`${url}/signalk/v1/stream`, {
      headers: {
        Authorization: `JWT ${readToken.substring(0, readToken.length - 1)}`
      }
    }).then((response) => response.status.should.equal(401))
  })

  it('websocket with invalid token returns 401', async () =>
    fetch(`${url}/signalk/v1/stream`, {
      headers: {
        Authorization: `JWT ${readToken[0] + 1}${readToken.substring(1)}`
      }
    }).then((response) => response.status.should.equal(401)))

  it('websockets acls work', async function () {
    const readPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=all&metaDeltas=none&token=${readToken}`
    )
    let msg = await readPromiser.nextMsg()
    JSON.parse(msg)

    const writePromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none&metaDeltas=none&token=${writeToken}`
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

  it('sending meta works', async function () {
    const readPromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=all&metaDeltas=none&token=${readToken}`
    )
    let msg = await readPromiser.nextMsg()
    JSON.parse(msg)

    const writePromiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subsribe=none&metaDeltas=none&token=${writeToken}`
    )
    msg = await writePromiser.nextMsg()
    JSON.parse(msg)

    const succeedingReadPromise = readPromiser.nextMsg()
    await writePromiser.send(metaDelta)
    const succeedingResult = await succeedingReadPromise
    succeedingResult.should.not.equal('timeout')

    console.log(succeedingResult)
    const d = JSON.parse(succeedingResult)
    d.updates.length.should.equal(1)
    d.updates[0].meta.length.should.equal(1)
    d.updates[0].meta[0].path.should.equal(metaDelta.updates[0].meta[0].path)
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
      `${url}/skServer/security/access/requests/1235-45653-343453/approved`,
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

    result = await fetch(`${url}/skServer/security/devices`, {
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
      `${url}/skServer/security/access/requests/1235-45653-343455/denied`,
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

    result = await fetch(`${url}/skServer/security/devices`, {
      headers: {
        Cookie: `JAUTHENTICATION=${adminToken}`
      }
    })
    json = await result.json()
    json.length.should.equal(1)
  })
})
