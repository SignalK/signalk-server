const WebSocket = require('ws')
const promisify = require('util').promisify
const fetch = require('node-fetch')

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

const defaultSecurityConfig = {
  allow_readonly: false,
  expiration: '1d',
  secretKey:
    '3ad6c2b567c43199e1afd2307ef506ea9fb5f8becada1f86c15213d75124fbaf4647c3f7202b788bba5c01c8bb8fdc52e8ca5bd484be36b6900ac03b88b6063b6157bee1e638acde1936d6ef4717884de63c86e9f50c8ee12b15bf837268b04bc09a461f5dddaf71dfc7205cc549b29810a31515b21d57ac5fdde29628ccff821cfc229004c4864576eb7c238b0cd3a6d774c14854affa1aeedbdb1f47194033f18e50d9dc1171a47e36f26c864080a627c500d1642fc94f71e93ff54022a8d4b00f19e88a0610ef70708ac6a386ba0df7cab201e24d3eb0061ddd0052d3d85cda50ac8d6cafc4ecc43d8db359a85af70d4c977a3d4b0d588f123406dbd57f01',
  users: []
}

const WRITE_USER_NAME = 'writeuser'
const WRITE_USER_PASSWORD = 'writepass'
const LIMITED_USER_NAME = 'testuser'
const LIMITED_USER_PASSWORD = 'verylimited'
const ADMIN_USER_NAME = 'adminuser'
const ADMIN_USER_PASSWORD = 'admin'

module.exports = {
  WsPromiser: WsPromiser,
  startServerP: function startServerP (port, enableSecurity, securityConfig) {
    const Server = require('../lib')

    const props = {
      config: {
        defaults: {
          vessels: {
            self: {
              uuid: 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
            }
          }
        },
        settings: {
          port,
          pipedProviders: [
            {
              id: 'deltaFromHttp',
              pipeElements: [
                {
                  type: 'test/httpprovider'
                }
              ]
            }
          ],
          interfaces: {
            plugins: false
          }
        }
      }
    }

    if (enableSecurity) {
      props.config.settings.security = {
        strategy: './tokensecurity'
      }
      props.securityConfig = {
        ...defaultSecurityConfig,
        ...(securityConfig || {})
      }
    }

    process.env.SIGNALK_NODE_CONDFIG_DIR = require('path').join(
      __dirname,
      'server-test-config'
    )

    const server = new Server(props)
    return new Promise((resolve, reject) => {
      server.start().then(s => {
        if (enableSecurity) {
          Promise.all([
            promisify(s.app.securityStrategy.addUser)(props.securityConfig, {
              userId: LIMITED_USER_NAME,
              type: 'read',
              password: LIMITED_USER_PASSWORD
            }),
            promisify(s.app.securityStrategy.addUser)(props.securityConfig, {
              userId: WRITE_USER_NAME,
              type: 'readwrite',
              password: WRITE_USER_PASSWORD
            }),
            promisify(s.app.securityStrategy.addUser)(props.securityConfig, {
              userId: ADMIN_USER_NAME,
              type: 'admin',
              password: ADMIN_USER_PASSWORD
            })
          ])
            .then(() => {
              resolve(s)
            })
            .catch(reject)
        } else {
          resolve(s)
        }
      })
    })
  },
  getReadOnlyToken: server => {
    return login(server, LIMITED_USER_NAME, LIMITED_USER_PASSWORD)
  },
  getWriteToken: server => {
    return login(server, WRITE_USER_NAME, WRITE_USER_PASSWORD)
  },
  getAdminToken: server => {
    return login(server, ADMIN_USER_NAME, ADMIN_USER_PASSWORD)
  }
}

function login (server, username, password) {
  return new Promise((resolve, reject) => {
    fetch(`http://0.0.0.0:${server.app.config.settings.port}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    })
      .then(result => {
        if (result.status != 200) {
          result.text().then(t => {
            reject(new Error(`Login returned ${result.status}: ${t}`))
          })
        }
        result.json().then(json => {
          resolve(json.token)
        })
      })
      .catch(reject)
  })
}
