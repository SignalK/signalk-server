/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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
var flatMap = require('flatmap')
const _ = require('lodash')
const ports = require('../ports')
const cookie = require('cookie')
const { getSourceId } = require('@signalk/signalk-schema')
const { requestAccess, InvalidTokenError } = require('../security')
const { findRequest, updateRequest } = require('../requestResponse')
const { putPath } = require('../put')
const debug = require('debug')('signalk-server:interfaces:ws')
const Primus = require('primus')

const supportedQuerySubscribeValues = ['self', 'all']

module.exports = function (app) {
  'use strict'

  const api = {}
  let started = false
  let primus
  const pathSources = {}

  api.mdns = {
    name: app.config.settings.ssl ? '_signalk-wss' : '_signalk-ws',
    type: 'tcp',
    port: ports.getExternalPort(app)
  }

  api.numClients = function () {
    var count = 0
    primus.forEach((spark, id, connections) => {
      count++
    })
    return count
  }

  api.canHandlePut = function (path, source) {
    const sources = pathSources[path]
    return sources && (!source || sources[source])
  }

  api.handlePut = function (requestId, context, path, source, value) {
    return new Promise((resolve, reject) => {
      var sources = pathSources[path]
      if (sources) {
        var spark
        if (source) {
          spark = sources[source]
        } else if (_.keys(sources).length == 1) {
          spark = _.values(sources)[0]
        } else {
          updateRequest(requestId, 'COMPLETED', {
            statusCode: 400,
            message:
              'there are multiple sources for the given path, but no source was specified in the request'
          })
            .then(resolve)
            .catch(reject)
          return
        }

        if (!spark) {
          reject(new Error('no spark found'))
          return
        }

        var listener = msg => {
          if (msg.requestId === requestId) {
            updateRequest(requestId, msg.state, msg)
              .then(reply => {
                if (reply.state !== 'PENDING') {
                  spark.removeListener('data', listener)
                }
              })
              .catch(err => {
                console.error(`could not update requestId ${requestId}`)
              })
          }
        }
        spark.on('data', listener)
        setTimeout(() => {
          const request = findRequest(r => (r.requestId = requestId))
          if (request && request.state === 'PENDING') {
            spark.removeListener('data', listener)
            updateRequest(requestId, 'COMPLETED', { statusCode: 504 })
          }
        }, 60 * 1000)

        spark.write({
          requestId: requestId,
          context: context,
          put: [{ path: path, value: value }]
        })

        updateRequest(requestId, 'PENDING', {})
          .then(resolve)
          .catch(reject)
      } else {
        reject(new Error('no source found'))
      }
    })
  }

  api.start = function () {
    debug('Starting Primus/WS interface')

    started = true

    const baseOptions = app.config.settings.wsCompression
      ? {
        compression: true,
        transport: {
          perMessageDeflate: { threshold: 0 }
        }
      }
      : {}
    const primusOptions = {
      ...baseOptions,
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      pingInterval: false
    }

    primus = new Primus(app.server, primusOptions)

    if (app.securityStrategy.canAuthorizeWS()) {
      primus.authorize(createPrimusAuthorize(app.securityStrategy.authorizeWS))
    }

    primus.on('connection', function (spark) {
      debug(spark.id + ' connected with params ' + JSON.stringify(spark.query))

      let onChange = delta => {
        var filtered = app.securityStrategy.filterReadDelta(
          spark.request.skPrincipal,
          delta
        )
        if (filtered) {
          spark.write(filtered)
        }
      }

      var unsubscribes = []

      spark.on('data', function (msg) {
        debug('<' + JSON.stringify(msg))
        if (msg.token) {
          spark.request.token = msg.token
        }

        if (msg.updates) {
          processUpdates(app, pathSources, spark, msg)
        }

        if (msg.subscribe) {
          processSubscribe(app, unsubscribes, spark, msg)
        }

        if (msg.unsubscribe) {
          processUnsubscribe(app, unsubscribes, msg)
        }

        if (msg.accessRequest) {
          processAccessRequest(spark, msg)
        }

        if (msg.login && app.securityStrategy.supportsLogin()) {
          processLoginRequest(spark, msg)
        }

        if (msg.put) {
          processPutRequest(spark, msg)
        }
      })

      spark.on('end', function () {
        unsubscribes.forEach(unsubscribe => unsubscribe())

        _.keys(pathSources).forEach(path => {
          _.keys(pathSources[path]).forEach(source => {
            if (pathSources[path][source] == spark) {
              debug('removing source for %s', path)
              delete pathSources[path][source]
            }
          })
        })
      })

      if (isSelfSubscription(spark.query)) {
        const realOnChange = onChange
        onChange = function (msg) {
          if (!msg.context || msg.context === app.selfContext) {
            realOnChange(msg)
          }
        }
      }

      if (spark.query.subscribe === 'none') {
        onChange = function () {}
      }

      onChange = wrapWithverifyWS(onChange)

      spark.onDisconnects = []
      spark.onDisconnect = function () {
        spark.onDisconnects.forEach(f => f())
      }

      spark.write({
        name: app.config.name,
        version: app.config.version,
        timestamp: new Date(),
        self: `vessels.${app.selfId}`,
        roles: ['master', 'main']
      })

      if (spark.query.startTime) {
        if (_.isUndefined(app.historyProvider)) {
          spark.end('No history provider')
          return
        }
        let options = {
          startTime: new Date(spark.query.startTime),
          playbackRate: spark.query.playbackRate,
          subscribe: spark.query.subscribe
        }
        app.historyProvider.hasAnyData(options, hasResults => {
          if (hasResults) {
            const onDisconnect = app.historyProvider.streamHistory(
              spark,
              options,
              onChange
            )
            spark.onDisconnects = [onDisconnect]
            spark.isHistory = true
          } else {
            spark.end('No data found')
          }
        })
      } else {
        app.signalk.on('delta', onChange)
        spark.onDisconnects = [
          () => {
            app.signalk.removeListener('delta', onChange)
          }
        ]

        const boundWrite = spark.write.bind(spark)
        if (!spark.query.subscribe || spark.query.subscribe === 'self') {
          app.deltaCache
            .getCachedDeltas(
              spark.request.skPrincipal,
              delta => delta.context === app.selfContext
            )
            .forEach(delta => spark.write(delta))
        } else if (spark.query.subscribe === 'all') {
          app.deltaCache
            .getCachedDeltas(spark.request.skPrincipal, delta => true)
            .forEach(boundWrite)
        }

        if (spark.query.serverevents && spark.query.serverevents === 'all') {
          const onServerEvent = wrapWithverifyWS(boundWrite)
          app.on('serverevent', onServerEvent)
          spark.onDisconnects.push(() => {
            app.removeListener('serverevent', onServerEvent)
          })
          Object.keys(app.lastServerEvents).forEach(propName => {
            spark.write(app.lastServerEvents[propName])
          })
          if (app.securityStrategy.canAuthorizeWS()) {
            spark.write({
              type: 'RECEIVE_LOGIN_STATUS',
              data: app.securityStrategy.getLoginStatus(spark.request)
            })
          }
        }
      }
      function wrapWithverifyWS (theFunction) {
        if (!app.securityStrategy.canAuthorizeWS()) {
          return theFunction
        }
        return msg => {
          try {
            app.securityStrategy.verifyWS(spark.request)
          } catch (error) {
            if (!spark.skPendingAccessRequest) {
              spark.end(
                '{message: "Connection disconnected by security constraint"}',
                { reconnect: true }
              )
            }
            return
          }
          theFunction(msg)
        }
      }
    })

    primus.on('disconnection', function (spark) {
      spark.onDisconnect()
      debug(spark.id + ' disconnected')
    })
  }

  api.stop = function () {
    if (primus.destroy && started) {
      debug('Destroying primus...')
      primus.destroy({
        close: false,
        timeout: 500
      })
    }
  }

  function processPutRequest (spark, msg) {
    putPath(
      app,
      msg.context,
      msg.put.path,
      msg.put,
      spark.request,
      msg.requestId,
      reply => {
        debug('sending put update %j', reply)
        spark.write(reply)
      }
    ).catch(err => {
      console.error(err)
      spark.write({
        requestId: msg.requestId,
        state: 'COMPLETED',
        statusCode: 502,
        message: err.message
      })
    })
  }

  function processAccessRequest (spark, msg) {
    if (spark.skPendingAccessRequest) {
      spark.write({
        requestId: msg.requestId,
        state: 'COMPLETED',
        statusCode: 400,
        message: 'A request has already beem submitted'
      })
    } else {
      requestAccess(
        app,
        msg,
        spark.request.headers['x-forwarded-for'] ||
          spark.request.connection.remoteAddress,
        res => {
          if (res.state === 'COMPLETED') {
            spark.skPendingAccessRequest = false

            if (res.accessRequest && res.accessRequest.token) {
              spark.request.token = res.accessRequest.token
              app.securityStrategy.authorizeWS(spark.request)
              spark.request.source =
                'ws.' + spark.request.skPrincipal.identifier.replace(/\./g, '_')
            }
          }
          spark.write(res)
        }
      )
        .then(res => {
          if (res.state === 'PENDING') {
            spark.skPendingAccessRequest = true
          }
          // nothing, callback above will get called
        })
        .catch(err => {
          console.log(err.stack)
          spark.write({
            requestId: msg.requestId,
            state: 'COMPLETED',
            statusCode: 502,
            message: err.message
          })
        })
    }
  }

  function processLoginRequest (spark, msg) {
    app.securityStrategy
      .login(msg.login.username, msg.login.password)
      .then(reply => {
        if (reply.token) {
          spark.request.token = reply.token
          app.securityStrategy.authorizeWS(spark.request)
        }
        spark.write({
          requestId: msg.requestId,
          state: 'COMPLETED',
          statusCode: reply.statusCode,
          login: {
            token: reply.token
          }
        })
      })
      .catch(err => {
        console.error(err)
        spark.write({
          requestId: msg.requestId,
          state: 'COMPLETED',
          statusCode: 502,
          message: err.message
        })
      })
  }

  return api
}

function normalizeDelta (delta) {
  return flatMap(delta.updates, normalizeUpdate).map(function (update) {
    return {
      context: delta.context,
      updates: [update]
    }
  })
}

function normalizeUpdate (update) {
  return update.values.map(function (value) {
    return {
      source: update.source,
      values: [value]
    }
  })
}

function createPrimusAuthorize (authorizeWS) {
  return function (req, authorized) {
    try {
      // can't do primus.use for cookies because it will come after authorized
      if (req.headers.cookie) {
        req.cookies = cookie.parse(req.headers.cookie)
      }

      authorizeWS(req)
      authorized()

      const identifier = _.get(req, 'skPrincipal.identifier')
      if (identifier) {
        debug(`authorized username: ${identifier}`)
        req.source = 'ws.' + identifier.replace(/\./g, '_')
      }
    } catch (error) {
      // To be able to login or request access via WS with security in place
      // only clearly invalid tokens result in 401 response, so that we can inform
      // the client that the credentials do not work.
      if (error instanceof InvalidTokenError) {
        authorized(error)
      } else {
        authorized()
      }
    }
  }
}

function processUpdates (app, pathSources, spark, msg) {
  if (!app.securityStrategy.shouldAllowWrite(spark.request, msg)) {
    debug('security disallowed update')
    app.setProviderError(
      'ws',
      spark.request.connection.remoteAddress + ' needs authentication'
    )
    return
  }
  app.handleMessage(spark.request.source || 'ws', msg)

  msg.updates.forEach(update => {
    let source = update['$source']
    if (!source && update.source) {
      source = getSourceId(update.source)
    }

    if (source) {
      update.values.forEach(valuePath => {
        if (!pathSources[valuePath.path]) {
          pathSources[valuePath.path] = {}
        }
        if (
          !pathSources[valuePath.path][source] ||
          pathSources[valuePath.path][source] != spark
        ) {
          if (pathSources[valuePath.path][source]) {
            console.log(
              `WARNING: got a new ws client for path ${
                valuePath.path
              } source ${source}`
            )
          }
          debug(
            'registered spark for source %s path %s = %s',
            source,
            valuePath.path,
            spark.id
          )

          pathSources[valuePath.path][source] = spark
        }
      })
    }
  })
}

function processSubscribe (app, unsubscribes, spark, msg) {
  if (spark.isHistory) {
    spark.end('Subscribe messages not supported with history playback')
    return
  }
  app.subscriptionmanager.subscribe(
    msg,
    unsubscribes,
    spark.write.bind(this),
    msg => {
      var filtered = app.securityStrategy.filterReadDelta(spark.request, msg)
      if (filtered) {
        spark.write(filtered)
      }
    },
    spark.request.skPrincipal
  )
}

function processUnsubscribe (app, unsubscribes, msg) {
  if (
    msg.unsubscribe &&
    msg.context === '*' &&
    msg.unsubscribe[0].path === '*'
  ) {
    debug('Unsubscribe all')
    unsubscribes.forEach(unsubscribe => unsubscribe())
    app.signalk.removeListener('delta', onChange)
  }
}

const isSelfSubscription = query =>
  !query.subscribe || query.subscribe === 'self'
