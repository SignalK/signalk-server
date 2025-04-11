import WebSocket from 'ws'
import { merge } from 'lodash-es'
import { promisify } from 'util'
import fetch from 'node-fetch'
import jwt from 'jsonwebtoken'
import path from 'path'
import Server from '../dist/index.js'

// Connects to the url via ws
// and provides Promises that are either resolved within
// timeout period as the next message from the ws or
// the string "timeout" in case timeout fires

const defaultConfig = {
  defaults: {
    vessels: {
      self: {
        uuid: 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
      }
    }
  },
  settings: {
    pipedProviders: [
      {
        id: 'deltaFromHttp',
        pipeElements: [
          {
            type: '../test/httpprovider'
          }
        ]
      }
    ],
    interfaces: {
      plugins: false
    }
  }
}

export function WsPromiser(url, timeout = 250) {
  this.ws = new WebSocket(url)
  this.ws.on('message', this.onMessage.bind(this))
  this.callees = []
  this.receivedMessagePromisers = []
  this.messageCount = 0
  this.timeout = timeout
  this.messages = []
}

WsPromiser.prototype.nextMsg = function () {
  const callees = this.callees
  return new Promise((resolve) => {
    callees.push(resolve)
    setTimeout((_) => {
      resolve('timeout')
    }, this.timeout)
  })
}

WsPromiser.prototype.nthMessagePromiser = function (n) {
  let result = this.receivedMessagePromisers[n - 1]
  if (!result) {
    result = this.receivedMessagePromisers[n - 1] = {}
    result.promise = new Promise((resolve, reject) => {
      result.resolve = resolve
      setTimeout((_) => {
        reject('timeout')
      }, 250)
    })
  }
  return result
}

WsPromiser.prototype.nthMessage = function (n) {
  return this.nthMessagePromiser(n).promise
}

WsPromiser.prototype.parsedMessages = function () {
  return this.messages.map((m) => JSON.parse(m))
}

WsPromiser.prototype.onMessage = function (message) {
  this.messages.push(message)
  const theCallees = this.callees
  this.callees = []
  theCallees.forEach((callee) => callee(message))

  this.nthMessagePromiser(++this.messageCount).resolve(message)
}

WsPromiser.prototype.send = function (message) {
  const that = this
  return new Promise((resolve) => {
    that.ws.send(JSON.stringify(message))
    setTimeout(() => resolve('wait over'), 100)
  })
}

const defaultSecurityConfig = {
  allow_readonly: false,
  expiration: '1d',
  secretKey: `${Date.now()}`,
  users: []
}

export const WRITE_USER_NAME = 'writeuser'
export const WRITE_USER_PASSWORD = 'writepass'
export const LIMITED_USER_NAME = 'testuser'
export const LIMITED_USER_PASSWORD = 'verylimited'
export const ADMIN_USER_NAME = 'adminuser'
export const ADMIN_USER_PASSWORD = 'admin'
export const NOPASSWORD_USER_NAME = 'nopassword'

export const serverTestConfigDirectory = () =>
  path.join(import.meta.dirname, 'server-test-config')

export function sendDelta(delta, deltaUrl) {
  return fetch(deltaUrl, {
    method: 'POST',
    body: JSON.stringify(delta),
    headers: { 'Content-Type': 'application/json' }
  })
}

export function startServerP(
  port,
  enableSecurity,
  extraConfig = {},
  securityConfig
) {
  const props = {
    config: JSON.parse(JSON.stringify(defaultConfig))
  }
  props.config.settings.port = port
  merge(props.config, extraConfig)

  if (enableSecurity) {
    props.config.settings.security = {
      strategy: './tokensecurity'
    }
    props.securityConfig = {
      ...defaultSecurityConfig,
      ...(securityConfig || {})
    }
  }

  process.env.SIGNALK_NODE_CONFIG_DIR = serverTestConfigDirectory()
  process.env.SIGNALK_DISABLE_SERVER_UPDATES = 'true'

  const server = new Server(props)
  return new Promise((resolve, reject) => {
    server.start().then((s) => {
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
          }),
          promisify(s.app.securityStrategy.addUser)(props.securityConfig, {
            userId: NOPASSWORD_USER_NAME,
            type: 'admin'
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
}

export function getReadOnlyToken(server) {
  return login(server, LIMITED_USER_NAME, LIMITED_USER_PASSWORD)
}

export function getWriteToken(server) {
  return login(server, WRITE_USER_NAME, WRITE_USER_PASSWORD)
}

export function getAdminToken(server) {
  return login(server, ADMIN_USER_NAME, ADMIN_USER_PASSWORD)
}

export function getToken(server, username) {
  return jwt.sign(
    {
      id: username
    },
    server.app.securityStrategy.securityConfig.secretKey,
    {
      expiresIn: '1h'
    }
  )
}

function login(server, username, password) {
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
      .then((result) => {
        if (result.status != 200) {
          result.text().then((t) => {
            reject(new Error(`Login returned ${result.status}: ${t}`))
          })
        } else {
          result.json().then((json) => {
            resolve(json.token)
          })
        }
      })
      .catch(reject)
  })
}
