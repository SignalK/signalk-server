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

var supportedQuerySubscribeValues = ['self', 'all']

module.exports = function (app) {
  'use strict'

  var _ = require('lodash'),
    debug = require('debug')('signalk-server:interfaces:ws'),
    Primus = require('primus'),
    api = {},
    started = false,
    primus

  api.mdns = {
    name: app.config.settings.ssl ? '_signalk-wss' : '_signalk-ws',
    type: 'tcp',
    port: ports.getExternalPort(app)
  }

  api.start = function () {
    debug('Starting Primus/WS interface')

    started = true

    primus = new Primus(app.server, {
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      pingInterval: false
    })

    if (app.securityStrategy) {
      primus.authorize(function (req, authorized) {
        try {
          app.securityStrategy.authorizeWS(req)
          authorized()

          var username = _.get(req, 'user.username')
          if (username) {
            debug(`authorized username: ${username}`)
            req.source = 'ws.' + username.replace(/\./g, '_')
          }
        } catch (error) {
          authorized(error)
        }
      })
    }

    primus.on('connection', function (spark) {
      debug(spark.id + ' connected with params ' + JSON.stringify(spark.query))

      var onChange = function (data) {
        spark.write(data)
      }

      var unsubscribes = []

      spark.on('data', function (msg) {
        debug('<' + JSON.stringify(msg))
        if (msg.updates) {
          if (
            app.securityStrategy &&
            !app.securityStrategy.shouldAllowWrite(spark.request)
          ) {
            debug('security disallowed update')
            return
          }
          app.handleMessage(spark.request.source || 'ws', msg)
        }
        if (msg.subscribe) {
          app.subscriptionmanager.subscribe(
            msg,
            unsubscribes,
            spark.write.bind(this),
            spark.write.bind(this)
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
      })

      if (!spark.query.subscribe || spark.query.subscribe === 'self') {
        onChange = function (msg) {
          if (!msg.context || msg.context === app.selfContext) {
            spark.write(msg)
          }
        }
      }

      if (spark.query.subscribe && spark.query.subscribe === 'none') {
        onChange = function () {}
      }

      onChange = wrapWithverifyWS(onChange)
      app.signalk.on('delta', onChange)
      spark.onDisconnects = [
        () => {
          app.signalk.removeListener('delta', onChange)
        }
      ]

      spark.onDisconnect = function () {
        spark.onDisconnects.forEach(f => f())
      }

      spark.write({
        name: app.config.name,
        version: app.config.version,
        timestamp: new Date(),
        self: app.selfId,
        roles: ['master', 'main']
      })

      if (spark.query.serverevents && spark.query.serverevents === 'all') {
        const onServerEvent = wrapWithverifyWS(serverEvent => {
          spark.write(serverEvent)
        })
        app.on('serverevent', onServerEvent)
        spark.onDisconnects.push(() => {
          app.removeListener('serverevent', onServerEvent)
        })
        Object.keys(app.lastServerEvents).forEach(propName => {
          spark.write(app.lastServerEvents[propName])
        })
      }

      function wrapWithverifyWS (theFunction) {
        if (!app.securityStrategy) {
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
