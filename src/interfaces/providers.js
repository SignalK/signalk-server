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
const _ = require('lodash')
const http = require('http')
const https = require('https')
const config = require('../config/config')
const { runDiscovery } = require('../discovery')
import { SERVERROUTESPREFIX } from '../constants'

module.exports = function (app) {
  app.on('discovered', (provider) => {
    app.discoveredProviders.push(provider)
    app.emit('serverevent', {
      type: 'DISCOVERY_CHANGED',
      from: 'discovery',
      data: getProviders(app.discoveredProviders, true)
    })
  })

  app.get(`${SERVERROUTESPREFIX}/providers`, (req, res) => {
    res.json(getProviders(app.config.settings.pipedProviders))
  })

  app.put(`${SERVERROUTESPREFIX}/runDiscovery`, (req, res) => {
    app.discoveredProviders = []
    runDiscovery(app)
    res.json('Discovery started')
  })

  function getProviders(source, wasDiscovered) {
    return source.map((provider) => {
      const type = provider.pipeElements[0].type
      let providerRes
      if (type === 'providers/simple' && provider.pipeElements.length === 1) {
        providerRes = JSON.parse(
          JSON.stringify(provider.pipeElements[0].options)
        )
        providerRes.id = provider.id
        providerRes.enabled = provider.enabled
        providerRes.options = providerRes.subOptions
        providerRes.editable = true
        delete providerRes.subOptions
      } else {
        providerRes = {
          id: provider.id,
          enabled: provider.enabled,
          json: JSON.stringify(provider, null, 2),
          type: `${type}`,
          editable: false
        }
      }
      if (wasDiscovered) {
        providerRes.isNew = true
        providerRes.wasDiscovered = true
      }
      return providerRes
    })
  }

  app.put(`${SERVERROUTESPREFIX}/providers/:id`, (req, res) => {
    updateProvider(req.params.id, req.body, res)
  })

  app.post(`${SERVERROUTESPREFIX}/providers`, (req, res) => {
    updateProvider(null, req.body, res)
  })

  app.delete(`${SERVERROUTESPREFIX}/providers/:id`, (req, res) => {
    const idx = app.config.settings.pipedProviders.findIndex(
      (p) => p.id === req.params.id
    )
    if (idx === -1) {
      res.status(401).send(`Connection with name ${req.params.id} not found`)
      return
    }
    app.config.settings.pipedProviders.splice(idx, 1)

    config.writeSettingsFile(app, app.config.settings, (err) => {
      if (err) {
        console.error(err)
        res.status(500).send('Unable to save to settings file')
      } else {
        app.pipedProviders.stopProvider(req.params.id)
        res.type('text/plain')
        res.send('Connection deleted')
      }
    })
  })

  function makeRemoteRequest(
    host,
    port,
    useTLS,
    selfsignedcert,
    path,
    method,
    headers,
    body
  ) {
    const protocol = useTLS ? https : http
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port,
        path,
        method: method || 'GET',
        headers: {
          ...(headers || {}),
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        rejectUnauthorized: !selfsignedcert
      }
      const req = protocol.request(options, (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          resolve({ status: response.statusCode, data })
        })
      })
      req.on('error', reject)
      req.setTimeout(10000, () => {
        req.destroy(new Error('Connection timed out'))
      })
      if (body) {
        req.write(JSON.stringify(body))
      }
      req.end()
    })
  }

  app.post(`${SERVERROUTESPREFIX}/testConnection`, (req, res) => {
    const { host, port, useTLS, token, selfsignedcert } = req.body

    makeRemoteRequest(host, port, useTLS, selfsignedcert, '/signalk')
      .then((discovery) => {
        if (discovery.status !== 200) {
          return res.json({
            success: false,
            error: `Discovery failed: HTTP ${discovery.status}`
          })
        }

        let server
        try {
          server = JSON.parse(discovery.data).server
        } catch (_e) {
          // ignore parse errors for server info
        }

        if (!token) {
          return res.json({
            success: true,
            authenticated: false,
            server
          })
        }

        return makeRemoteRequest(
          host,
          port,
          useTLS,
          selfsignedcert,
          '/skServer/loginStatus',
          'GET',
          { Authorization: `JWT ${token}` }
        ).then((loginResult) => {
          let loginStatus
          try {
            loginStatus = JSON.parse(loginResult.data)
          } catch (_e) {
            // ignore parse errors
          }

          if (
            loginResult.status !== 200 ||
            !loginStatus ||
            loginStatus.status !== 'loggedIn'
          ) {
            return res.json({
              success: false,
              connected: true,
              error: 'Authentication failed: token may be invalid or revoked',
              server
            })
          }

          res.json({
            success: true,
            authenticated: true,
            userLevel: loginStatus.userLevel,
            username: loginStatus.username,
            server
          })
        })
      })
      .catch((err) => {
        res.json({ success: false, error: err.message })
      })
  })

  app.post(`${SERVERROUTESPREFIX}/requestAccess`, (req, res) => {
    const { host, port, useTLS, selfsignedcert, clientId, description } =
      req.body

    makeRemoteRequest(
      host,
      port,
      useTLS,
      selfsignedcert,
      '/signalk/v1/access/requests',
      'POST',
      {},
      { clientId, description }
    )
      .then((result) => {
        try {
          const data = JSON.parse(result.data)
          res.json(data)
        } catch (_e) {
          res.json({
            state: 'ERROR',
            error: `Unexpected response: HTTP ${result.status}`
          })
        }
      })
      .catch((err) => {
        res.json({ state: 'ERROR', error: err.message })
      })
  })

  app.post(`${SERVERROUTESPREFIX}/checkAccessRequest`, (req, res) => {
    const { host, port, useTLS, selfsignedcert, requestId } = req.body

    makeRemoteRequest(
      host,
      port,
      useTLS,
      selfsignedcert,
      `/signalk/v1/requests/${requestId}`
    )
      .then((result) => {
        try {
          const data = JSON.parse(result.data)
          res.json(data)
        } catch (_e) {
          res.json({
            state: 'ERROR',
            error: `Unexpected response: HTTP ${result.status}`
          })
        }
      })
      .catch((err) => {
        res.json({ state: 'ERROR', error: err.message })
      })
  })

  function updateProvider(idToUpdate, provider, res) {
    const isNew = _.isUndefined(idToUpdate) || idToUpdate === null
    const existing = app.config.settings.pipedProviders.find(
      (p) => p.id === (isNew ? provider.id : idToUpdate)
    )

    if (isNew && existing) {
      res.status(401).send(`Connection with ID '${provider.id}' already exists`)
      return
    } else if (!isNew && idToUpdate !== provider.id) {
      if (
        app.config.settings.pipedProviders.find((p) => p.id === provider.id)
      ) {
        res
          .status(401)
          .send(`Connection with ID '${provider.id}' already exists`)
        return
      }
    }

    if (!provider.id || provider.id.length === 0) {
      res.status(401).send('Please enter a provider ID')
      return
    }

    if (provider.wasDiscovered) {
      const idx = app.discoveredProviders.findIndex(
        (p) => p.id === provider.originalId
      )
      app.discoveredProviders.splice(idx, 1)
      app.emit('serverevent', {
        type: 'DISCOVERY_CHANGED',
        from: 'discovery',
        data: getProviders(app.discoveredProviders)
      })
    }

    const updatedProvider = existing || {
      pipeElements: [
        {
          type: 'providers/simple',
          options: {}
        }
      ]
    }

    if (provider.options.type === 'canbus-canboatjs') {
      const uniqueNumber = parseInt(provider.options.uniqueNumber, 10)
      if (!isNaN(uniqueNumber)) {
        provider.options.uniqueNumber = uniqueNumber
      } else {
        provider.options.uniqueNumber = Math.floor(Math.random() * 2097151)
      }

      const mfgCode = parseInt(provider.options.mfgCode, 10)
      if (!isNaN(mfgCode)) {
        provider.options.mfgCode = mfgCode
      } else {
        if (provider.options.mfgCode !== '') delete provider.options.mfgCode //if value is not empty or not a number then removing property
      }
    }

    if (applyProviderSettings(updatedProvider, provider, res)) {
      if (isNew) {
        app.config.settings.pipedProviders.push(updatedProvider)
      }

      config.writeSettingsFile(app, app.config.settings, (err) => {
        if (err) {
          console.error(err)
          res.status(500).send('Unable to save to settings file')
        } else {
          if (!isNew && idToUpdate !== provider.id) {
            app.pipedProviders.stopProvider(idToUpdate)
          }
          app.pipedProviders.restartProvider(provider.id)
          res.type('text/plain')
          res.send('Connection ' + (isNew ? 'added' : 'updated'))
        }
      })
    }
  }
}

function applyProviderSettings(target, source, res) {
  if (source.type === 'Unknown') {
    res.status(401).send('Can not update an Unknown type')
    return false
  }

  const options = target.pipeElements[0].options

  target.id = source.id
  target.enabled = source.enabled
  options.logging = source.logging
  options.type = source.type

  if (!options.subOptions || options.subOptions.type !== source.options.type) {
    options.subOptions = {}
  }

  _.assign(options.subOptions, source.options)

  return true
}
