const freeport = require('freeport-promise')
const Server = require('../lib')
const fetch = require('fetch-cookie')(require('node-fetch'))
const http = require('http')
const promisify = require('util').promisify
const assert = require('assert')

const agent = new http.Agent({})

describe('Security', () => {
  it('works', async function () {
    var securityConfig = {
      allow_readonly: false,
      expiration: '1d',
      secretKey:
        '3ad6c2b567c43199e1afd2307ef506ea9fb5f8becada1f86c15213d75124fbaf4647c3f7202b788bba5c01c8bb8fdc52e8ca5bd484be36b6900ac03b88b6063b6157bee1e638acde1936d6ef4717884de63c86e9f50c8ee12b15bf837268b04bc09a461f5dddaf71dfc7205cc549b29810a31515b21d57ac5fdde29628ccff821cfc229004c4864576eb7c238b0cd3a6d774c14854affa1aeedbdb1f47194033f18e50d9dc1171a47e36f26c864080a627c500d1642fc94f71e93ff54022a8d4b00f19e88a0610ef70708ac6a386ba0df7cab201e24d3eb0061ddd0052d3d85cda50ac8d6cafc4ecc43d8db359a85af70d4c977a3d4b0d588f123406dbd57f01',
      users: [],
      acls: []
    }
    const port = await freeport()
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
    const server = await serverApp.start()

    await promisify(server.app.securityStrategy.addUser)(securityConfig, {
      userId: 'testuser',
      type: 'readonly',
      password: 'testpassword'
    })

    var result = await fetch(
      `http://0.0.0.0:${port}/signalk/v1/api/vessels/self`
    )
    assert(result.status === 401)

    result = await fetch(`http://0.0.0.0:${port}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'badpassword'
      })
    })
    assert(result.status === 401)

    result = await fetch(`http://0.0.0.0:${port}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'testpassword'
      })
    })
    assert(result.status === 200)
    console.log(JSON.stringify(result))

    result = await fetch(`http://0.0.0.0:${port}/signalk/v1/api/vessels/self`)
    assert(result.status === 200)

    result = await fetch(`http://0.0.0.0:${port}/plugins`)
    assert(result.status === 401)

    result = await fetch(`http://0.0.0.0:${port}/logout`, {
      method: 'PUT',
      credentials: 'include'
    })
    assert(result.status === 200)

    result = await fetch(`http://0.0.0.0:${port}/signalk/v1/api/vessels/self`, {
      credentials: 'include'
    })
    assert(result.status === 401)

    await server.stop()
  })
})
