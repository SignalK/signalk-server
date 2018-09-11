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

var supportedQuerySubscribeValues = ['self', 'all']

module.exports = function (app) {
  'use strict'

  var _ = require('lodash'),
    debug = require('debug')('signalk-server:interfaces:ws'),
    Primus = require('primus'),
    api = {},
    started = false,
    primus,
    pathSources = {}

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

  api.handlePut = function (context, path, source, value) {
    var sources = pathSources[path]
    if (sources) {
      var spark
      if (source) {
        spark = sources[source]
      } else if (_.keys(sources).length == 1) {
        spark = _.values(sources)[0]
      } else {
        console.error(
          'ERROR: unable to handle put, there are multiple sources, but no source specified in the request'
        )
        return false
      }

      if (spark) {
        spark.write({
          context: context,
          put: [{ path: path, value: value }]
        })
        return true
      }
    }
    return false
  }

  api.start = function () {
    debug('Starting Primus/WS interface')

    started = true

    const primusOptions = {
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      pingInterval: false
    }

    if (app.config.settings.wsCompression) {
      Object.assign(primusOptions, {
        compression: true,
        transport: {
          perMessageDeflate: { threshold: 0 }
        }
      })
    }
    console.log(primusOptions)

    primus = new Primus(app.server, primusOptions)

    if (app.securityStrategy.canAuthorizeWS()) {
      primus.authorize(function (req, authorized) {
        try {
          // can't do primus.use for cookies because it will come after authorized
          if (req.headers.cookie) {
            req.cookies = cookie.parse(req.headers.cookie)
          }

          app.securityStrategy.authorizeWS(req)
          authorized()

          var username = _.get(req, 'skUser.id')
          if (username) {
            debug(`authorized username: ${username}`)
            req.source = 'ws.' + username.replace(/\./g, '_')
          }
        } catch (error) {
          // console.error(error)
          authorized(error)
        }
      })
    }

    primus.on('connection', function (spark) {
      debug(spark.id + ' connected with params ' + JSON.stringify(spark.query))

      var onChange = function (data) {
        spark.write(data)
      }

      var aclFilter = delta => {
        var filtered = app.securityStrategy.filterReadDelta(
          spark.request.skUser,
          delta
        )
        if (filtered) {
          spark.write(filtered)
        }
      }

      if (app.securityStrategy.shouldFilterDeltas()) {
        onChange = aclFilter
      }

      var unsubscribes = []

      spark.on('data', function (msg) {
        debug('<' + JSON.stringify(msg))
        if (msg.updates) {
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
            var source = update['$source']
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

        if (msg.subscribe) {
          if (spark.isHistory) {
            spark.end('Subscribe messages not supported with history playback')
            return
          }
          app.subscriptionmanager.subscribe(
            msg,
            unsubscribes,
            spark.write.bind(this),
            app.securityStrategy.shouldFilterDeltas()
              ? msg => {
                var filtered = app.securityStrategy.filterReadDelta(
                  spark.request,
                  msg
                )
                if (filtered) {
                  spark.write(filtered)
                }
              }
              : spark.write.bind(this),
            spark.request.skUser
          )
        }
        if (
          msg.unsubscribe &&
          msg.context === '*' &&
          msg.unsubscribe[0].path === '*'
        ) {
          debug('Unsubscribe all')
          unsubscribes.forEach(unsubscribe => unsubscribe())
          app.signalk.removeListener('delta', onChange)
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

      if (!spark.query.subscribe || spark.query.subscribe === 'self') {
        onChange = function (msg) {
          if (!msg.context || msg.context === app.selfContext) {
            if (app.securityStrategy.shouldFilterDeltas()) {
              aclFilter(msg)
            } else {
              spark.write(msg)
            }
          }
        }
      }

      if (spark.query.subscribe && spark.query.subscribe === 'none') {
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
              spark.request.skUser,
              delta => delta.context === app.selfContext
            )
            .forEach(delta => spark.write(delta))
        } else if (spark.query.subscribe === 'all') {
          app.deltaCache
            .getCachedDeltas(spark.request.skUser, delta => true)
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
            spark.end(
              '{message: "Connection disconnected by security constraint"}',
              { reconnect: true }
            )
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
