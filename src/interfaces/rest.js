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

const debug = require('debug')('signalk-server:interfaces:rest')
const express = require('express')
const { getMetadata, getUnits } = require('@signalk/signalk-schema')
const ports = require('../ports')
const geolib = require('geolib')
const _ = require('lodash')

const iso8601rexexp = /^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?Z$/

module.exports = function(app) {
  'use strict'

  const pathPrefix = '/signalk'
  const versionPrefix = '/v1'
  const apiPathPrefix = pathPrefix + versionPrefix + '/api/'
  const streamPath = pathPrefix + versionPrefix + '/stream'

  return {
    start: function() {
      app.use('/', express.static(__dirname + '/../../public'))

      app.get(apiPathPrefix + '*', function(req, res, next) {
        let path = String(req.path).replace(apiPathPrefix, '')

        if (path === 'self') {
          return res.json(`vessels.${app.selfId}`)
        }

        path = path.length > 0 ? path.replace(/\/$/, '').split('/') : []

        if (path.length > 4 && path[path.length - 1] === 'meta') {
          let meta = getMetadata(path.slice(0, path.length - 1).join('.'))
          let fromDefaults = _.get(app.deltaCache.defaults, path.join('.'))
          if (meta || fromDefaults) {
            res.json({ ...meta, ...fromDefaults })
            return
          }
        }
        if (
          path.length > 5 &&
          path[path.length - 1] === 'units' &&
          path[path.length - 2] === 'meta'
        ) {
          let units = _.get(app.deltaCache.defaults, path.join('.'))
          if (!units) {
            units = getUnits(path.slice(0, path.length - 2).join('.'))
          }
          if (units) {
            res.json(units)
            return
          }
        }

        path = path.map(p => (p === 'self' ? app.selfId : p))

        function sendResult(last, aPath) {
          if (last) {
            // tslint:disable-next-line: forin
            for (const i in aPath) {
              const p = aPath[i]

              if (typeof last[p] !== 'undefined') {
                last = last[p]
              } else {
                next()
                return
              }
            }
          } else {
            next()
            return
          }

          return res.json(last)
        }

        if (path[0] && path[0] === 'snapshot') {
          if (!req.query.time) {
            res.status(400).send('Snapshot api requires time query parameter')
          } else {
            if (!iso8601rexexp.test(req.query.time)) {
              res
                .status(400)
                .send(
                  'Time query parameter must be a valid ISO 8601 UTC time value like 2018-12-11T18:40:03.246'
                )
            } else if (!app.historyProvider) {
              res.status(501).send('No history provider')
            } else {
              const realPath = path.slice(1)
              app.historyProvider.getHistory(
                new Date(req.query.time),
                realPath,
                deltas => {
                  if (deltas.length === 0) {
                    res.status(404).send('No data found for the given time')
                    return
                  }
                  const last = app.deltaCache.buildFullFromDeltas(
                    req.skPrincipal,
                    deltas
                  )
                  sendResult(last, realPath)
                }
              )
            }
          }
        } else {
          let last
          if (app.securityStrategy.anyACLs()) {
            last = app.deltaCache.buildFull(req.skPrincipal, path)
          } else {
            last = app.signalk.retrieve()
          }
          sendResult(last, path)
        }
      })

      app.get(pathPrefix, function(req, res) {
        const host = req.headers.host
        const splitHost = host.split(':')

        let httpProtocol = 'http://'
        let wsProtocol = 'ws://'
        if (app.config.settings.ssl) {
          httpProtocol = 'https://'
          wsProtocol = 'wss://'
        }

        const services = {
          version: getVersion(),
          'signalk-http': httpProtocol + host + apiPathPrefix,
          'signalk-ws': wsProtocol + host + streamPath
        }

        if (app.interfaces.tcp && app.interfaces.tcp.data) {
          services[
            'signalk-tcp'
          ] = `tcp://${splitHost[0]}:${app.interfaces.tcp.data.port}`
        }

        res.json({
          endpoints: {
            v1: services
          },
          server: {
            id: 'signalk-server-node',
            version: app.config.version
          }
        })
      })

      if (app.historyProvider && app.historyProvider.registerHistoryApiRoute) {
        debug('Adding history api route')
        const historyApiRouter = express.Router()
        app.historyProvider.registerHistoryApiRoute(historyApiRouter)
        app.use(pathPrefix + versionPrefix + '/history', historyApiRouter)
      }
    },

    mdns: {
      name: app.config.settings.ssl ? '_signalk-https' : '_signalk-http',
      type: 'tcp',
      port: ports.getExternalPort(app)
    }
  }
}

const getVersion = () => require('../../package.json').version
