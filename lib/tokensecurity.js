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

const CONFIG_PLUGINID = 'sk-simple-token-security-config'
const passwordSaltRounds = 10

module.exports = function (app, config) {
  const strategy = {}

  let {
    allow_readonly = true,
    expiration = '1d',
    secretKey = process.env.SECRETKEY ||
      require('crypto')
        .randomBytes(256)
        .toString('hex'),
    users = [],
    immutableConfig = false,
    acls = []
  } = config

  if (process.env.ADMINUSER) {
    const adminUserParts = process.env.ADMINUSER.split(':')
    if (adminUserParts.length != 2) {
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

  let options = {
    allow_readonly,
    expiration,
    secretKey,
    users,
    immutableConfig,
    acls
  }

  // so that enableSecurity gets the defaults to save
  _.merge(config, options)

  function getConfiguration () {
    return options
  }
  strategy.getConfiguration = getConfiguration

  function getIsEnabled () {
    // var options = getOptions();
    // return typeof options.enabled !== 'undefined' && options.enabled;
    return true
  }

  function assertConfigImmutability () {
    if (options.immutableConfig) {
      throw new Error('Configuration is immutable')
    }
  }

  function setupApp () {
    app.use(require('body-parser').urlencoded({ extended: true }))

    app.use(require('cookie-parser')())

    app.post('/login', function (req, res) {
      try {
        var name = req.body.username
        var password = req.body.password

        debug('username: ' + name)
        var configuration = getConfiguration()

        var user = configuration.users.find(user => user.username == name)
        if (!user) {
          res.status(401).send('Invalid Username')
          return
        }
        bcrypt.compare(password, user.password, (err, matches) => {
          if (matches == true) {
            var payload = { id: user.username }
            var expiration = configuration.expiration || '1h'
            debug('jwt expiration: ' + expiration)
            var token = jwt.sign(payload, configuration.secretKey, {
              expiresIn: expiration
            })

            res.cookie('JAUTHENTICATION', token, { httpOnly: true })

            var requestType = req.get('Content-Type')

            if (requestType == 'application/json') {
              res.json({ token: token })
            } else {
              res.redirect(req.body.destination ? req.body.destination : '/')
            }
          } else {
            debug('password did not match')
            res.status(401).send('Invalid Password')
          }
        })
      } catch (err) {
        console.log(err)
        res.status(401).send('Login Failure')
      }
    })

    var do_redir = http_authorize(true)

    app.use('/', function (req, res, next) {
      debug('do_redir: ' + req.path)
      if (req.path == '/') {
        do_redir(req, res, next)
      } else {
        next()
      }
    })
    app.use('/apps', http_authorize(true))
    app.use('/appstore', http_authorize(true))
    app.use('/plugins', http_authorize(true))
    app.use('/restart', http_authorize(false))
    app.use('/security', http_authorize(false))
    app.use('/vessel', http_authorize(false))
    app.use('/providers', http_authorize(false))
    app.use('/settings', http_authorize(false))
    app.use('/webapps', http_authorize(false))

    app.put('/logout', function (req, res) {
      res.clearCookie('JAUTHENTICATION')
      res.send('Logout OK')
    })

    function adminAuthenticationMiddleware (redirect) {
      return function (req, res, next) {
        if (!getIsEnabled()) {
          return next()
        }

        debug('isAuthenticated: ' + req.isAuthenticated)
        if (req.isAuthenticated) {
          if (req.user.type == 'admin') {
            return next()
          }
        }
        res.status(401)
        res.send('Permission Denied')
      }
    }

    function readOnlyAuthenticationMiddleware (redirect) {
      return function (req, res, next) {
        if (!getIsEnabled()) {
          return next()
        }
        debug('isAuthenticated: ' + req.isAuthenticated)
        if (req.isAuthenticated) {
          if (
            ['admin', 'readonly', 'readwrite'].find(
              type => req.user.type == type
            )
          ) {
            return next()
          }
        }
        res.status(401)
        res.send('Permission Denied')
      }
    }

    app.use('/restart', adminAuthenticationMiddleware(false))
    app.use('/plugins', adminAuthenticationMiddleware(true))
    app.use('/appstore', adminAuthenticationMiddleware(true))
    app.use('/security', adminAuthenticationMiddleware(false))
    app.use('/settings', adminAuthenticationMiddleware(false))
    app.use('/providers', adminAuthenticationMiddleware(false))
    app.use('/vessel', adminAuthenticationMiddleware(false))

    app.use('/loginStatus', http_authorize(false, true))

    var no_redir = http_authorize(false)
    app.use('/signalk/v1/*', function (req, res, next) {
      no_redir(req, res, next)
    })
  }

  strategy.generateToken = function (req, res, next, id, expiration) {
    var configuration = getConfiguration()
    var payload = { id: id }
    var token = jwt.sign(payload, configuration.secretKey, {
      expiresIn: expiration
    })
    res.send(token)
  }

  strategy.allowRestart = function (req) {
    return req.isAuthenticated && req.user.type == 'admin'
  }

  strategy.allowConfigure = function (req) {
    return req.isAuthenticated && req.user.type == 'admin'
  }

  strategy.getLoginStatus = function (req) {
    var configuration = getConfiguration()
    var result = {
      status: req.isAuthenticated ? 'loggedIn' : 'notLoggedIn',
      readOnlyAccess: configuration.allow_readonly,
      authenticationRequired: true
    }
    if (req.isAuthenticated) {
      result.userLevel = req.user.type
      result.username = req.user.id
    }
    if (configuration.users.length == 0) {
      result.noUsers = true
    }
    return result
  }

  strategy.getConfig = config => {
    delete config['users']
    delete config['secretKey']
    return config
  }

  strategy.setConfig = (config, newConfig) => {
    assertConfigImmutability()
    newConfig.users = config.users
    newConfig.secretKey = config.secretKey
    options = newConfig
    return newConfig
  }

  strategy.getUsers = config => {
    if (config && config.users) {
      return config.users.map(user => {
        return {
          userId: user.username,
          type: user.type
        }
      })
    } else {
      return []
    }
  }

  function addUser (config, user, callback) {
    assertConfigImmutability()
    bcrypt.hash(user.password, passwordSaltRounds, (err, hash) => {
      if (err) {
        callback(err)
      } else {
        var newuser = {
          username: user.userId,
          type: user.type,
          password: hash
        }
        if (!config.users) {
          config.users = []
        }
        config.users.push(newuser)
        options = config
        callback(err, config)
      }
    })
  }

  strategy.updateUser = (config, username, updates, callback) => {
    assertConfigImmutability()
    var user = config.users.find(user => user.username == username)

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
          callback(err, config)
        }
      })
    } else {
      callback(null, config)
    }
    options = config
  }

  strategy.addUser = addUser

  strategy.setPassword = (config, username, password, callback) => {
    assertConfigImmutability()
    bcrypt.hash(password, passwordSaltRounds, (err, hash) => {
      if (err) {
        callback(err)
      } else {
        var user = config.users[username]
        user.password = hash
        options = config
        callback(err, config)
      }
    })
  }

  strategy.deleteUser = (config, username, callback) => {
    assertConfigImmutability()
    for (var i = config.users.length - 1; i >= 0; i--) {
      if (config.users[i].username == username) {
        config.users.splice(i, 1)
        break
      }
    }
    options = config
    callback(null, config)
  }

  strategy.shouldAllowWrite = function (req, delta) {
    if (
      req.user &&
      (req.user.type === 'admin' || req.user.type === 'readwrite')
    ) {
      var context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      var notAllowed = delta.updates.find(update => {
        var source = update['$source']
        if (!source) {
          source = getSourceId(update.source)
        }
        return update.values.find(valuePath => {
          return (
            strategy.checkACL(
              req.user.id,
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

  strategy.filterReadDelta = (user, delta) => {
    var configuration = getConfiguration()
    if (delta.updates && configuration.acls && configuration.acls.length) {
      var context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      delta.updates = delta.updates
        .map(update => {
          update.values = update.values
            .map(valuePath => {
              return strategy.checkACL(
                user.id,
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
    } else {
      return delta
    }
  }

  strategy.verifyWS = function (spark) {
    if (!spark.lastTokenVerify) {
      spark.lastTokenVerify = new Date()
      return
    }

    if (!getIsEnabled()) {
      return
    }

    var now = new Date()
    if (now - spark.lastTokenVerify > 60 * 1000) {
      debug('verify token')
      spark.lastTokenVerify = now
      strategy.authorizeWS(spark)
    }
  }

  strategy.authorizeWS = function (req) {
    var token = req.query.token,
      error,
      payload

    if (!getIsEnabled()) {
      return
    }

    var configuration = getConfiguration()

    if (!token) {
      var header = req.headers.authorization
      if (header && header.startsWith('JWT ')) {
        token = header.substring('JWT '.length)
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
        error = new Error('Invalid access token')
      } else if (Date.now() / 1000 > payload.exp) {
        //
        // At this point we have decoded and verified the token. Check if it is
        // expired.
        //

        error = new Error('Expired access token')
      }
    }

    if (!token || error) {
      if (configuration.allow_readonly) {
        req.user = { id: 'AUTO', type: 'readonly' }
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
    // Check if the user is still present and allowed in our db. You could tweak
    // this to invalidate a token.
    //
    var user = configuration.users.find(user => user.username == payload.id)
    if (!user) {
      error = new Error('Invalid access token')
      debug(error.message)
      throw error
    }

    req.user = payload
    req.user.type = user.type
    req.isAuthenticated = true
  }

  strategy.checkACL = (id, context, path, source, operation) => {
    var configuration = getConfiguration()

    if (!configuration.acls || configuration.acls.length == 0) {
      // no acls, so allow anything
      return true
    }

    var acl = configuration.acls.find(acl => {
      var pattern = acl.context.replace('.', '\\.').replace('*', '.*')
      var matcher = new RegExp('^' + pattern + '$')
      return matcher.test(context)
    })

    if (acl) {
      var pathPerms = acl.resources.find(p => {
        var perms

        if (p.paths) {
          perms = p.paths.find(p => {
            var pattern = p.replace('.', '\\.').replace('*', '.*')
            var matcher = new RegExp('^' + pattern + '$')
            return matcher.test(path)
          })
        } else if (p.sources) {
          perms = p.sources.find(p => {
            var pattern = p.replace('.', '\\.').replace('*', '.*')
            var matcher = new RegExp('^' + pattern + '$')
            return matcher.test(source)
          })
        }

        return perms
      })

      if (pathPerms) {
        var perm = pathPerms.permissions.find(p => p.subject == id)
        if (!perm) {
          perm = pathPerms.permissions.find(p => p.subject === 'any')
        }
        if (!perm) {
          return false
        }

        if (
          operation === 'read' &&
          (perm.permission === 'write' || perm.permission == 'read')
        ) {
          return true
        } else if (operation === 'write' && perm.permission === 'write') {
          return true
        } else {
          return false
        }
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
    var configuration = getConfiguration()
    return configuration.acls && configuration.acls.length > 0
  }

  function http_authorize (redirect, forLoginStatus) {
    // debug('http_authorize: ' + redirect)
    return function (req, res, next) {
      var token = req.cookies.JAUTHENTICATION

      debug(`http_authorize: ${req.path} (forLogin: ${forLoginStatus})`)

      if (!getIsEnabled()) {
        return next()
      }

      var configuration = getConfiguration()

      if (!token) {
        var header = req.headers.authorization
        if (header && header.startsWith('JWT ')) {
          token = header.substring('JWT '.length)
        }
      }

      if (token) {
        jwt.verify(token, configuration.secretKey, function (err, decoded) {
          debug('verify')
          if (!err) {
            var user = configuration.users.find(
              user => user.username == decoded.id
            )
            if (user) {
              debug('authorized')
              req.user = decoded
              req.user.type = user.type
              req.isAuthenticated = true
              req.userLoggedIn = true
              next()
              return
            } else {
              debug('unknown user: ' + decoded.id)
            }
          } else {
            debug('bad token: ' + req.path)
          }

          if (configuration.allow_readonly) {
            req.isAuthenticated = false
            next()
          } else {
            res.status(401).send('bad auth token')
          }
        })
      } else {
        debug('no token')

        if (configuration.allow_readonly && !forLoginStatus) {
          req.user = { id: 'AUTO', type: 'readonly' }
          req.isAuthenticated = true
          return next()
        } else {
          req.isAuthenticated = false

          if (forLoginStatus) {
            next()
          } else {
            res.status(401).send('bad auth token')
          }
        }
      }
    }
  }

  setupApp()

  return strategy
}
