const chai = require('chai')
chai.Should()
const { startServerP } = require('./servertestutilities')
const { freeport } = require('./ts-servertestutilities')

describe('Rate Limiting', () => {
  let server, url, port

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`
    const securityConfig = {
      allowNewUserRegistration: true,
      allowDeviceAccessRequests: true
    }
    server = await startServerP(port, true, {}, securityConfig)
  })

  after(async function () {
    await server.stop()
  })

  it('should limit login attempts', async function () {
    const requests = []
    for (let i = 0; i < 10; i++) {
      requests.push(
        fetch(`${url}/signalk/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'admin',
            password: 'wrongpassword'
          })
        })
      )
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrongpassword'
      })
    })

    res.status.should.equal(429)
  })

  it('should limit access requests', async function () {
    const requests = []
    for (let i = 0; i < 100; i++) {
      requests.push(
        fetch(`${url}/signalk/v1/access/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: `device-${i}`,
            description: `Device ${i}`
          })
        })
      )
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'device-101',
        description: 'Device 101'
      })
    })

    res.status.should.equal(429)
  })

  it('should limit request status checks', async function () {
    const requests = []
    for (let i = 0; i < 100; i++) {
      requests.push(fetch(`${url}/signalk/v1/requests/123`))
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/requests/123`)
    res.status.should.equal(429)
  })

  it('should limit login status checks', async function () {
    const requests = []
    for (let i = 0; i < 10; i++) {
      requests.push(fetch(`${url}/loginStatus`))
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/loginStatus`)
    res.status.should.equal(429)
  })
})
