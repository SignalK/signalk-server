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

const express = require('express')
const { getMetadata, getUnits } = require('@signalk/signalk-schema')
const ports = require('../ports')

module.exports = function(app) {
  'use strict'

  const pathPrefix = '/signalk'
  const versionPrefix = '/v1'
  const apiPathPrefix = pathPrefix + versionPrefix + '/api/'
  const streamPath = pathPrefix + versionPrefix + '/stream'

  return {
    start: function() {
      app.use(
        '/',
        express.static(require('path').join(__dirname, '/../../public'))
      )

      app.get(apiPathPrefix + '*', function(req, res, next) {
        let path = String(req.path).replace(apiPathPrefix, '')

        if (path === 'self') {
          return res.json(`vessels.${app.selfId}`)
        }

        path =
          path.length > 0
            ? path
                .replace(/\/$/, '')
                .replace(/self/, app.selfId)
                .split('/')
            : []

        if (
          path.length > 4 &&
          path[path.length - 1] === 'meta' &&
          path[0] === 'vessels'
        ) {
          const meta = getMetadata(path.slice(0, path.length - 1).join('.'))
          if (meta) {
            res.json(meta)
            return
          }
        }
        if (
          path.length > 5 &&
          path[path.length - 1] === 'units' &&
          path[path.length - 2] === 'meta' &&
          path[0] === 'vessels'
        ) {
          const units = getUnits(path.slice(0, path.length - 2).join('.'))
          if (units) {
            res.json(units)
            return
          }
        }

        function sendResult(last, path) {
          if (last) {
            for (const i in path) {
              const p = path[i]

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

        if (req.query.time) {
          if (!app.historyProvider) {
            res.status(404).send('No history provider')
          } else {
            app.historyProvider.getHistory(
              new Date(req.query.time),
              path,
              deltas => {
                if (deltas.length === 0) {
                  res.status(404).send('No data found for the given time')
                  return
                }
                const last = app.deltaCache.buildFullFromDeltas(
                  req.skUser,
                  deltas
                )
                sendResult(last, path)
              }
            )
          }
        } else {
          const last = app.deltaCache.buildFull(req.skUser, path)
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
          services['signalk-tcp'] = `tcp://${splitHost[0]}:${
            app.interfaces.tcp.data.port
          }`
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
    },

    mdns: {
      name: app.config.settings.ssl ? '_signalk-https' : '_signalk-http',
      type: 'tcp',
      port: ports.getExternalPort(app)
    }
  }
}

const getVersion = () => require('../../package.json').version
