/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('sk-simple-token-security')
const util = require('util')
const jwt = require('jsonwebtoken')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const getSourceId = require('@signalk/signalk-schema').getSourceId
const uuidv4 = require('uuid/v4')
const { InvalidTokenError } = require('./security')
const {
  createRequest,
  updateRequest,
  findRequest,
  filterRequests
} = require('./requestResponse')

const CONFIG_PLUGINID = 'sk-simple-token-security-config'
const passwordSaltRounds = 10
const permissionDeniedMessage =
  // tslint:disable-next-line
  "You do not have permission to view this resource, <a href='/@signalk/server-admin-ui/#/login'>Please Login</a>"

const skPrefix = '/signalk/v1'
const skAPIPrefix = `${skPrefix}/api`
const skAuthPrefix = `${skPrefix}/auth`

module.exports = function(app, config) {
  const strategy = {}
  const accessRequests = []

  let {
    expiration = '1d',
    users = [],
    immutableConfig = false,
    allowDeviceAccessRequests = true,
    allowNewUserRegistration = true
  } = config

  const {
    allow_readonly = true,
    secretKey = process.env.SECRETKEY ||
      require('crypto')
        .randomBytes(256)
        .toString('hex'),
    devices = [],
    acls = []
  } = config

  if (process.env.ADMINUSER) {
    const adminUserParts = process.env.ADMINUSER.split(':')
    if (adminUserParts.length !== 2) {
      console.error(
        'ADMINUSER env parameters must be in username:password format'
      )
      process.exit(-1)
    }
    users = [
      {
        username: adminUserParts[0],
        type: 'admin',
        password: bcrypt.hashSync(
          adminUserParts[1],
          bcrypt.genSaltSync(passwordSaltRounds)
        )
      }
    ]
    immutableConfig = true
  }

  if (process.env.ALLOW_DEVICE_ACCESS_REQUESTS) {
    allowDeviceAccessRequests =
      process.env.ALLOW_DEVICE_ACCESS_REQUESTS === 'true'
  }

  if (process.env.ALLOW_NEW_USER_REGISTRATION) {
    allowNewUserRegistration =
      process.env.ALLOW_NEW_USER_REGISTRATION === 'true'
  }

  let options = {
    allow_readonly,
    expiration,
    secretKey,
    users,
    devices,
    immutableConfig,
    acls,
    allowDeviceAccessRequests,
    allowNewUserRegistration
  }

  // so that enableSecurity gets the defaults to save
  _.merge(config, options)

  function getConfiguration() {
    return options
  }
  strategy.getConfiguration = getConfiguration

  function getIsEnabled() {
    // var options = getOptions();
    // return typeof options.enabled !== 'undefined' && options.enabled;
    return true
  }

  function assertConfigImmutability() {
    if (options.immutableConfig) {
      throw new Error('Configuration is immutable')
    }
  }

  function handlePermissionDenied(req, res, next) {
    res.status(401)
    if (req.accepts('application/json') && !req.accepts('text/html')) {
      res.set('Content-Type', 'application/json')
      res.send('{ "error": "Permission Denied"}')
    } else {
      res.send(permissionDeniedMessage)
    }
  }

  function adminAuthenticationMiddleware(redirect) {
    return function(req, res, next) {
      if (!getIsEnabled()) {
        return next()
      }

      if (req.skIsAuthenticated && req.skPrincipal) {
        if (req.skPrincipal.permissions === 'admin') {
          return next()
        } else if (req.skPrincipal.identifier === 'AUTO' && redirect) {
          res.redirect('/@signalk/server-admin-ui/#/login')
        } else {
          handlePermissionDenied(req, res, next)
        }
      } else if (redirect) {
        res.redirect('/@signalk/server-admin-ui/#/login')
      } else {
        handlePermissionDenied(req, res, next)
      }
    }
  }

  function setupApp() {
    app.use(require('body-parser').urlencoded({ extended: true }))

    app.use(require('cookie-parser')())

    app.post(['/login', `${skAuthPrefix}/login`], (req, res) => {
      const name = req.body.username
      const password = req.body.password

      login(name, password)
        .then(reply => {
          const requestType = req.get('Content-Type')

          if (reply.statusCode === 200) {
            res.cookie('JAUTHENTICATION', reply.token, { httpOnly: true })

            if (requestType === 'application/json') {
              res.json({ token: reply.token })
            } else {
              res.redirect(req.body.destination ? req.body.destination : '/')
            }
          } else {
            if (requestType === 'application/json') {
              res.status(reply.statusCode).send(reply)
            } else {
              res.status(reply.statusCode).send(reply.message)
            }
          }
        })
        .catch(err => {
          console.log(err)
          res.status(502).send('Login Failure')
        })
    })

    // tslint:disable-next-line:variable-name
    const do_redir = http_authorize(false)

    app.use('/apps', http_authorize(false))
    app.use('/appstore', http_authorize(false))
    app.use('/plugins', http_authorize(false))
    app.use('/restart', http_authorize(false))
    app.use('/runDiscovery', http_authorize(false))
    app.use('/security', http_authorize(false))
    app.use('/vessel', http_authorize(false))
    app.use('/providers', http_authorize(false))
    app.use('/settings', http_authorize(false))
    app.use('/webapps', http_authorize(false))

    app.put(['/logout', `${skAuthPrefix}/logout`], function(req, res) {
      res.clearCookie('JAUTHENTICATION')
      res.send('Logout OK')
    })

    function writeAuthenticationMiddleware(redirect) {
      return function(req, res, next) {
        if (!getIsEnabled()) {
          return next()
        }

        debug('skIsAuthenticated: ' + req.skIsAuthenticated)
        if (req.skIsAuthenticated) {
          if (
            req.skPrincipal.permissions === 'admin' ||
            req.skPrincipal.permissions === 'readwrite'
          ) {
            return next()
          }
        }
        handlePermissionDenied(req, res, next)
      }
    }

    function readOnlyAuthenticationMiddleware(redirect) {
      return function(req, res, next) {
        if (!getIsEnabled()) {
          return next()
        }
        debug('skIsAuthenticated: ' + req.skIsAuthenticated)
        if (req.skIsAuthenticated) {
          if (
            ['admin', 'readonly', 'readwrite'].find(
              type => req.skPrincipal.permissions === type
            )
          ) {
            return next()
          }
        }
        handlePermissionDenied(req, res, next)
      }
    }

    app.use('/restart', adminAuthenticationMiddleware(false))
    app.use('/runDiscovery', adminAuthenticationMiddleware(false))
    app.use('/plugins', adminAuthenticationMiddleware(false))
    app.use('/appstore', adminAuthenticationMiddleware(false))
    app.use('/security', adminAuthenticationMiddleware(false))
    app.use('/settings', adminAuthenticationMiddleware(false))
    app.use('/providers', adminAuthenticationMiddleware(false))
    app.use('/vessel', adminAuthenticationMiddleware(false))

    app.use('/loginStatus', http_authorize(false, true))

    // tslint:disable-next-line:variable-name
    const no_redir = http_authorize(false)
    app.use('/signalk/v1/api/*', function(req, res, next) {
      no_redir(req, res, next)
    })
    app.put('/signalk/v1/*', writeAuthenticationMiddleware(false))
  }

  function login(name, password) {
    return new Promise((resolve, reject) => {
      debug('logging in user: ' + name)
      const configuration = getConfiguration()

      const user = configuration.users.find(aUser => aUser.username === name)
      if (!user) {
        resolve({ statusCode: 401, message: 'Invalid Username' })
        return
      }

      bcrypt.compare(password, user.password, (err, matches) => {
        if (err) {
          reject(err)
        } else if (matches === true) {
          const payload = { id: user.username }
          const theExpiration = configuration.expiration || '1h'
          debug('jwt expiration: ' + theExpiration)
          const token = jwt.sign(payload, configuration.secretKey, {
            expiresIn: theExpiration
          })
          resolve({ statusCode: 200, token })
        } else {
          debug('password did not match')
          resolve({ statusCode: 401, message: 'Invalid Password' })
        }
      })
    })
  }

  strategy.getAuthRequiredString = () => {
    return strategy.allowReadOnly() ? 'forwrite' : 'always'
  }

  strategy.supportsLogin = () => true
  strategy.login = login

  strategy.addAdminMiddleware = function(aPath) {
    app.use(aPath, http_authorize(false))
    app.use(aPath, adminAuthenticationMiddleware(false))
  }

  strategy.generateToken = function(req, res, next, id, theExpiration) {
    const configuration = getConfiguration()
    const payload = { id: id }
    const token = jwt.sign(payload, configuration.secretKey, {
      expiresIn: theExpiration
    })
    res.send(token)
  }

  strategy.allowReadOnly = function() {
    const configuration = getConfiguration()
    return configuration.allow_readonly
  }

  strategy.allowRestart = function(req) {
    return req.skIsAuthenticated && req.skPrincipal.permissions === 'admin'
  }

  strategy.allowConfigure = function(req) {
    return req.skIsAuthenticated && req.skPrincipal.permissions === 'admin'
  }

  strategy.getLoginStatus = function(req) {
    const configuration = getConfiguration()
    const result = {
      status: req.skIsAuthenticated ? 'loggedIn' : 'notLoggedIn',
      readOnlyAccess: configuration.allow_readonly,
      authenticationRequired: true,
      allowNewUserRegistration: configuration.allowNewUserRegistration,
      allowDeviceAccessRequests: configuration.allowDeviceAccessRequests
    }
    if (req.skIsAuthenticated) {
      result.userLevel = req.skPrincipal.permissions
      result.username = req.skPrincipal.identifier
    }
    if (configuration.users.length === 0) {
      result.noUsers = true
    }
    return result
  }

  strategy.getConfig = aConfig => {
    delete aConfig.users
    delete aConfig.secretKey
    return aConfig
  }

  strategy.setConfig = (aConfig, newConfig) => {
    assertConfigImmutability()
    newConfig.users = aConfig.users
    newConfig.devices = aConfig.devices
    newConfig.secretKey = aConfig.secretKey
    options = newConfig
    return newConfig
  }

  strategy.getUsers = aConfig => {
    if (aConfig && aConfig.users) {
      return aConfig.users.map(user => {
        return {
          userId: user.username,
          type: user.type
        }
      })
    } else {
      return []
    }
  }

  function addUser(theConfig, user, callback) {
    assertConfigImmutability()
    bcrypt.hash(user.password, passwordSaltRounds, (err, hash) => {
      if (err) {
        callback(err)
      } else {
        const newuser = {
          username: user.userId,
          type: user.type,
          password: hash
        }
        if (!theConfig.users) {
          theConfig.users = []
        }
        theConfig.users.push(newuser)
        options = theConfig
        callback(err, theConfig)
      }
    })
  }

  strategy.updateUser = (theConfig, username, updates, callback) => {
    assertConfigImmutability()
    const user = theConfig.users.find(aUser => aUser.username === username)

    if (!user) {
      callback(new Error('user not found'))
      return
    }

    if (updates.type) {
      user.type = updates.type
    }

    if (updates.password) {
      bcrypt.hash(updates.password, passwordSaltRounds, (err, hash) => {
        if (err) {
          callback(err)
        } else {
          user.password = hash
          callback(err, theConfig)
        }
      })
    } else {
      callback(null, theConfig)
    }
    options = theConfig
  }

  strategy.addUser = addUser

  strategy.setPassword = (theConfig, username, password, callback) => {
    assertConfigImmutability()
    bcrypt.hash(password, passwordSaltRounds, (err, hash) => {
      if (err) {
        callback(err)
      } else {
        const user = theConfig.users[username]
        user.password = hash
        options = theConfig
        callback(err, theConfig)
      }
    })
  }

  strategy.deleteUser = (theConfig, username, callback) => {
    assertConfigImmutability()
    for (let i = theConfig.users.length - 1; i >= 0; i--) {
      if (theConfig.users[i].username === username) {
        theConfig.users.splice(i, 1)
        break
      }
    }
    options = theConfig
    callback(null, theConfig)
  }

  strategy.getDevices = theConfig => {
    if (theConfig && theConfig.devices) {
      return theConfig.devices
    } else {
      return []
    }
  }

  strategy.deleteDevice = (theConfig, clientId, callback) => {
    assertConfigImmutability()
    for (let i = theConfig.devices.length - 1; i >= 0; i--) {
      if (theConfig.devices[i].clientId === clientId) {
        theConfig.devices.splice(i, 1)
        break
      }
    }
    options = theConfig
    callback(null, theConfig)
  }

  strategy.updateDevice = (theConfig, clientId, updates, callback) => {
    assertConfigImmutability()
    const device = theConfig.devices.find(d => d.clientId === clientId)

    if (!device) {
      callback(new Error('device not found'))
      return
    }

    if (updates.permissions) {
      device.permissions = updates.permissions
    }

    if (updates.description) {
      device.description = updates.description
    }

    callback(null, theConfig)
    options = theConfig
  }

  strategy.shouldAllowWrite = function(req, delta) {
    if (
      req.skPrincipal &&
      (req.skPrincipal.permissions === 'admin' ||
        req.skPrincipal.permissions === 'readwrite')
    ) {
      const context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      const notAllowed = delta.updates.find(update => {
        let source = update.$source
        if (!source) {
          source = getSourceId(update.source)
        }
        return update.values.find(valuePath => {
          return (
            strategy.checkACL(
              req.skPrincipal.identifier,
              context,
              valuePath.path,
              source,
              'write'
            ) === false
          )
        })
      })

      // true if we did not find anything disallowing the write
      return _.isUndefined(notAllowed)
    }
    return false
  }

  // tslint:disable-next-line:variable-name
  strategy.shouldAllowPut = function(req, _context, source, thePath) {
    if (
      req.skPrincipal &&
      (req.skPrincipal.permissions === 'admin' ||
        req.skPrincipal.permissions === 'readwrite')
    ) {
      const context = _context === app.selfContext ? 'vessels.self' : _context

      return strategy.checkACL(
        req.skPrincipal.identifier,
        context,
        thePath,
        source,
        'put'
      )
    }
    return false
  }

  strategy.anyACLs = () => {
    const configuration = getConfiguration()
    return configuration.acls && configuration.acls.length
  }

  strategy.filterReadDelta = (principal, delta) => {
    const configuration = getConfiguration()
    if (delta.updates && configuration.acls && configuration.acls.length) {
      const context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      delta.updates = delta.updates
        .map(update => {
          update.values = update.values
            .map(valuePath => {
              return strategy.checkACL(
                principal.identifier,
                context,
                valuePath.path,
                update.source,
                'read'
              )
                ? valuePath
                : null
            })
            .filter(vp => vp != null)
          return update.values.length > 0 ? update : null
        })
        .filter(update => update != null)
      return delta.updates.length > 0 ? delta : null
    } else if (!principal) {
      return null
    } else {
      return delta
    }
  }

  strategy.verifyWS = function(spark) {
    if (!spark.lastTokenVerify) {
      spark.lastTokenVerify = Date.now()
      return
    }

    if (!getIsEnabled()) {
      return
    }

    const now = Date.now()
    if (now - spark.lastTokenVerify > 60 * 1000) {
      debug('verify token')
      spark.lastTokenVerify = now
      strategy.authorizeWS(spark)
    }
  }

  strategy.authorizeWS = function(req) {
    let token = req.token
    let error
    let payload

    if (!getIsEnabled()) {
      return
    }

    const configuration = getConfiguration()

    if (!token) {
      if (req.query && req.query.token) {
        token = req.query.token
      } else if (req.headers) {
        const header = req.headers.authorization
        if (header && header.startsWith('JWT ')) {
          token = header.substring('JWT '.length)
        }
      }
    }

    if (!token) {
      token = req.cookies && req.cookies.JAUTHENTICATION
    }

    //
    // `jwt-simple` throws errors if something goes wrong when decoding the JWT.
    //
    if (token) {
      payload = jwt.decode(token, configuration.secretKey)

      if (!payload) {
        error = new InvalidTokenError('Invalid access token')
      } else if (Date.now() / 1000 > payload.exp) {
        //
        // At this point we have decoded and verified the token. Check if it is
        // expired.
        //

        error = new InvalidTokenError('Expired access token')
      }
    }

    if (!token || error) {
      if (configuration.allow_readonly) {
        req.skPrincipal = { identifier: 'AUTO', permissions: 'readonly' }
        return
      } else {
        if (!error) {
          error = new Error('Missing access token')
        }
        debug(error.message)
        throw error
      }
    }

    //
    // Check if the user/device is still present and allowed in our db. You could tweak
    // this to invalidate a token.
    //

    const principal = getPrincipal(payload)
    if (!principal) {
      error = new InvalidTokenError(
        `Invalid identity ${JSON.stringify(payload)}`
      )
      debug(error.message)
      throw error
    }

    req.skPrincipal = principal
    req.skIsAuthenticated = true
  }

  strategy.checkACL = (id, context, thePath, source, operation) => {
    const configuration = getConfiguration()

    if (!configuration.acls || configuration.acls.length === 0) {
      // no acls, so allow anything
      return true
    }

    const acl = configuration.acls.find(theAcl => {
      const pattern = theAcl.context.replace('.', '\\.').replace('*', '.*')
      const matcher = new RegExp('^' + pattern + '$')
      return matcher.test(context)
    })

    if (acl) {
      const pathPerms = acl.resources.find(p => {
        let perms

        if (p.paths) {
          perms = p.paths.find(aPath => {
            const pattern = aPath.replace('.', '\\.').replace('*', '.*')
            const matcher = new RegExp('^' + pattern + '$')
            return matcher.test(thePath)
          })
        } else if (p.sources) {
          perms = p.sources.find(s => {
            const pattern = s.replace('.', '\\.').replace('*', '.*')
            const matcher = new RegExp('^' + pattern + '$')
            return matcher.test(source)
          })
        }

        return perms
      })

      if (pathPerms) {
        let perms = pathPerms.permissions.filter(p => p.subject === id)
        perms = perms.concat(
          pathPerms.permissions.filter(p => p.subject === 'any')
        )
        if (perms.length === 0) {
          return false
        }

        return (
          perms.find(perm => {
            if (
              operation === 'read' &&
              (perm.permission === 'write' || perm.permission === 'read')
            ) {
              return true
            } else if (operation === 'write' && perm.permission === 'write') {
              return true
            } else if (operation === 'put' && perm.permission === 'put') {
              return true
            } else {
              return false
            }
          }) != null
        )
      }
    }
    return false
  }

  strategy.isDummy = () => {
    return false
  }

  strategy.canAuthorizeWS = () => {
    return true
  }

  strategy.shouldFilterDeltas = () => {
    const configuration = getConfiguration()
    return configuration.acls && configuration.acls.length > 0
  }

  function getPrincipal(payload) {
    let principal
    if (payload.id) {
      const user = options.users.find(
        theUser => theUser.username === payload.id
      )
      if (user) {
        principal = {
          identifier: user.username,
          permissions: user.type
        }
      }
    } else if (payload.device && options.devices) {
      const device = options.devices.find(
        aDevice => aDevice.clientId === payload.device
      )
      if (device) {
        principal = {
          identifier: device.clientId,
          permissions: device.permissions
        }
      }
    }
    return principal
  }

  function http_authorize(redirect, forLoginStatus) {
    // debug('http_authorize: ' + redirect)
    return function(req, res, next) {
      let token = req.cookies.JAUTHENTICATION

      debug(`http_authorize: ${req.path} (forLogin: ${forLoginStatus})`)

      if (!getIsEnabled()) {
        return next()
      }

      const configuration = getConfiguration()

      if (!token) {
        const header = req.headers.authorization
        if (header && header.startsWith('JWT ')) {
          token = header.substring('JWT '.length)
        }
      }

      if (token) {
        jwt.verify(token, configuration.secretKey, function(err, decoded) {
          debug('verify')
          if (!err) {
            const principal = getPrincipal(decoded)
            if (principal) {
              debug('authorized')
              req.skPrincipal = principal
              req.skIsAuthenticated = true
              req.userLoggedIn = true
              next()
              return
            } else {
              debug('unknown user: ' + (decoded.id || decoded.device))
            }
          } else {
            debug('bad token: ' + req.path)
          }

          if (configuration.allow_readonly) {
            req.skIsAuthenticated = false
            next()
          } else {
            res.clearCookie('JAUTHENTICATION')
            res.status(401).send('bad auth token')
          }
        })
      } else {
        debug('no token')

        if (configuration.allow_readonly && !forLoginStatus) {
          req.skPrincipal = { identifier: 'AUTO', permissions: 'readonly' }
          req.skIsAuthenticated = true
          return next()
        } else {
          req.skIsAuthenticated = false

          if (forLoginStatus) {
            next()
          } else if (redirect) {
            debug('redirecting to login')
            res.redirect('/@signalk/server-admin-ui/#/login')
          } else {
            res.status(401).send('Unauthorized')
          }
        }
      }
    }
  }

  strategy.getAccessRequestsResponse = () => {
    return filterRequests('accessRequest', 'PENDING')
  }

  function sendAccessRequestsUpdate() {
    app.emit('serverevent', {
      type: 'ACCESS_REQUEST',
      from: CONFIG_PLUGINID,
      data: strategy.getAccessRequestsResponse()
    })
  }

  strategy.setAccessRequestStatus = (
    theConfig,
    identifier,
    status,
    body,
    cb
  ) => {
    const request = findRequest(
      r => r.state === 'PENDING' && r.accessIdentifier === identifier
    )
    if (!request) {
      cb(new Error('not found'))
      return
    }

    const permissoinPart = request.requestedPermissions
      ? request.permissions
      : 'any'

    app.handleMessage(CONFIG_PLUGINID, {
      context: 'vessels.' + app.selfId,
      updates: [
        {
          values: [
            {
              path: `notifications.security.accessRequest.${permissoinPart}.${identifier}`,
              value: {
                state: 'normal',
                method: [],
                message: `The device "${request.accessDescription}" has been ${status}`,
                timestamp: new Date().toISOString()
              }
            }
          ]
        }
      ]
    })

    let approved
    if (status === 'approved') {
      if (request.clientRequest.accessRequest.clientId) {
        const payload = { device: identifier }
        const jwtOptions = {}

        const expiresIn = body.expiration || theConfig.expiration
        if (expiresIn !== 'NEVER') {
          jwtOptions.expiresIn = expiresIn
        }
        const token = jwt.sign(payload, theConfig.secretKey, jwtOptions)

        if (!theConfig.devices) {
          theConfig.devices = []
        }

        theConfig.devices = theConfig.devices.filter(
          d => d.clientId !== identifier
        )

        theConfig.devices.push({
          clientId: request.accessIdentifier,
          permissions: !request.clientRequest.requestedPermissions
            ? body.permissions
            : request.permissions,
          config: body.config,
          description: request.accessDescription,
          requestedPermissions: request.clientRequest.requestedPermissions
        })
        request.token = token
      } else {
        theConfig.users.push({
          username: identifier,
          password: request.accessPassword,
          type: body.permissions
        })
      }
      approved = true
    } else if (status === 'denied') {
      approved = false
    } else {
      cb(new Error('Unkown status value'), theConfig)
      return
    }

    options = theConfig

    updateRequest(request.requestId, 'COMPLETED', {
      statusCode: 200,
      data: {
        permission: approved ? 'APPROVED' : 'DENIED',
        token: request.token
      }
    })
      .then(reply => {
        cb(null, theConfig)
        sendAccessRequestsUpdate()
      })
      .catch(err => {
        cb(err)
      })
  }

  function validateAccessRequest(request) {
    if (request.userId) {
      return !_.isUndefined(request.password)
    } else if (request.clientId) {
      return !_.isUndefined(request.description)
    } else {
      return false
    }
  }

  strategy.requestAccess = (theConfig, clientRequest, sourceIp, updateCb) => {
    return new Promise((resolve, reject) => {
      createRequest('accessRequest', clientRequest, null, sourceIp, updateCb)
        .then(request => {
          const accessRequest = clientRequest.accessRequest
          if (!validateAccessRequest(accessRequest)) {
            updateRequest(request.requestId, 'COMPLETED', { statusCode: 400 })
              .then(resolve)
              .catch(reject)
            return
          }

          request.requestedPermissions = !_.isUndefined(
            accessRequest.permissions
          )
          if (!request.requestedPermissions) {
            request.permissions = 'readonly'
          } else {
            request.permissions = accessRequest.permissions
          }

          let alertMessage
          let response
          if (accessRequest.clientId) {
            if (!options.allowDeviceAccessRequests) {
              updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
                .then(resolve)
                .catch(reject)
              return
            }

            if (
              findRequest(
                r =>
                  r.state === 'PENDING' &&
                  r.accessIdentifier === accessRequest.clientId
              )
            ) {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 400,
                message: `A device with clientId '${accessRequest.clientId}' has already requested access`
              })
                .then(resolve)
                .catch(reject)
              return
            }

            request.accessIdentifier = accessRequest.clientId
            request.accessDescription = accessRequest.description

            debug(
              `A device with IP ${request.ip} and CLIENTID ${accessRequest.clientId} has requested access to the server`
            )
            alertMessage = `The device "${accessRequest.description}" has requested access to the server`
          } else {
            if (!options.allowNewUserRegistration) {
              updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
                .then(resolve)
                .catch(reject)
              return
            }

            const existing = options.users.find(
              user => user.username === accessRequest.userId
            )
            if (existing) {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 400,
                message: 'User already exists'
              })
                .then(resolve)
                .catch(reject)
              return
            }
            request.accessDescription = 'New User Request'
            request.accessIdentifier = accessRequest.userId
            request.accessPassword = bcrypt.hashSync(
              request.accessPassword,
              bcrypt.genSaltSync(passwordSaltRounds)
            )
            alertMessage = `${accessRequest.userId} has requested server access`
            debug(alertMessage)
          }

          const permissoinPart = request.requestedPermissions
            ? request.permissions
            : 'any'
          sendAccessRequestsUpdate()
          app.handleMessage(CONFIG_PLUGINID, {
            context: 'vessels.' + app.selfId,
            updates: [
              {
                values: [
                  {
                    path: `notifications.security.accessRequest.${permissoinPart}.${request.accessIdentifier}`,
                    value: {
                      state: 'alert',
                      method: ['visual', 'sound'],
                      message: alertMessage,
                      timestamp: new Date().toISOString()
                    }
                  }
                ]
              }
            ]
          })
          updateRequest(request.requestId, 'PENDING', { statusCode: 202 })
            .then(reply => {
              resolve(reply, theConfig)
            })
            .catch(reject)
        })
        .catch(reject)
    })
  }

  setupApp()

  return strategy
}
