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

describe('Rate Limiting with trustProxy enabled', () => {
  let server, url, port
  let consoleErrorSpy, consoleLogSpy, capturedLogs

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`
    const securityConfig = {
      allowNewUserRegistration: true,
      allowDeviceAccessRequests: true
    }

    // Capture console output to check for ERR_ERL_PERMISSIVE_TRUST_PROXY errors
    capturedLogs = []
    const originalConsoleError = console.error
    const originalConsoleLog = console.log
    consoleErrorSpy = console.error = (...args) => {
      capturedLogs.push(args.join(' '))
      originalConsoleError.apply(console, args)
    }
    consoleLogSpy = console.log = (...args) => {
      capturedLogs.push(args.join(' '))
      originalConsoleLog.apply(console, args)
    }

    // Enable trustProxy: true to verify no ERR_ERL_PERMISSIVE_TRUST_PROXY errors
    const extraConfig = {
      settings: {
        trustProxy: true
      }
    }
    server = await startServerP(port, true, extraConfig, securityConfig)
  })

  after(async function () {
    await server.stop()
    // Restore console methods
    console.error = consoleErrorSpy
    console.log = consoleLogSpy
  })

  it('should start without rate limiter errors logged and handle requests', async function () {
    // Make a request to trigger rate limiting logic
    const res = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrongpassword'
      })
    })

    // Should get 401 (unauthorized) not a server error
    res.status.should.equal(401)

    // Verify no rate limiter validation errors were logged
    const allLogs = capturedLogs.join('\n')
    allLogs.should.not.include('ERR_ERL_PERMISSIVE_TRUST_PROXY')
    allLogs.should.not.include('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')
  })

  it('should respect X-Forwarded-For header when trustProxy is enabled', async function () {
    // With trustProxy enabled, rate limiting should use X-Forwarded-For for client IP
    // Make 2 requests from same actual client but with different X-Forwarded-For IPs
    // Both should succeed (not rate limited) because they appear to come from different IPs

    const res1 = await fetch(`${url}/loginStatus`, {
      headers: {
        'X-Forwarded-For': '192.168.1.100'
      }
    })
    res1.status.should.be.oneOf([200, 401, 403])

    const res2 = await fetch(`${url}/loginStatus`, {
      headers: {
        'X-Forwarded-For': '192.168.1.101'
      }
    })
    res2.status.should.be.oneOf([200, 401, 403])

    // Now make 11 requests with the SAME X-Forwarded-For IP
    // First 10 should succeed, but the 11th should be rate limited
    const requests = []
    for (let i = 0; i < 11; i++) {
      requests.push(
        fetch(`${url}/loginStatus`, {
          headers: {
            'X-Forwarded-For': '192.168.1.200'
          }
        })
      )
    }

    const results = await Promise.all(requests)

    // First 10 requests should succeed
    for (let i = 0; i < 10; i++) {
      results[i].status.should.be.oneOf([200, 401, 403])
    }

    // The 11th request (index 10) should be rate limited
    results[10].status.should.equal(429)
  })
})
