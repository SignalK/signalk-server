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

import { IRouter, Request, Response } from 'express'
import { ConfigApp, writeSettingsFile } from '../config/config'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runDiscovery } = require('../discovery')
import { SERVERROUTESPREFIX } from '../constants'

// 21-bit unique number per NMEA 2000 standard (0x1FFFFF)
const MAX_CANBUS_UNIQUE_NUMBER = 0x1fffff

interface PipeElement {
  type: string
  options: {
    type?: string
    logging?: boolean
    subOptions?: Record<string, unknown>
    [key: string]: unknown
  }
}

interface PipedProvider {
  id: string
  enabled: boolean
  pipeElements: PipeElement[]
}

interface ProviderRequest {
  id: string
  enabled: boolean
  type: string
  logging?: boolean
  editable?: boolean
  wasDiscovered?: boolean
  originalId?: string
  options: {
    type?: string
    uniqueNumber?: number | string
    mfgCode?: number | string
    [key: string]: unknown
  }
}

interface ProviderResponse {
  id: string
  enabled: boolean
  type?: string
  editable: boolean
  isNew?: boolean
  wasDiscovered?: boolean
  logging?: boolean
  json?: string
  options?: Record<string, unknown>
  [key: string]: unknown
}

interface App extends ConfigApp, IRouter {
  discoveredProviders: PipedProvider[]
}

function getProviders(
  source: PipedProvider[],
  wasDiscovered?: boolean
): ProviderResponse[] {
  return source.map((provider) => {
    const type = provider.pipeElements[0].type
    let providerRes: ProviderResponse
    if (type === 'providers/simple' && provider.pipeElements.length === 1) {
      const options = provider.pipeElements[0].options
      providerRes = {
        ...JSON.parse(JSON.stringify(options)),
        id: provider.id,
        enabled: provider.enabled,
        options: options.subOptions as Record<string, unknown>,
        editable: true
      }
      delete (providerRes as Record<string, unknown>).subOptions
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

function applyProviderSettings(
  target: PipedProvider,
  source: ProviderRequest,
  res: Response
): boolean {
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

  Object.assign(options.subOptions, source.options)

  return true
}

function isValidProviderBody(body: unknown): body is ProviderRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  if (b.id !== undefined && typeof b.id !== 'string') return false
  if (
    b.options !== undefined &&
    (typeof b.options !== 'object' || Array.isArray(b.options))
  )
    return false
  return true
}

module.exports = function (app: App) {
  app.on('discovered', (provider) => {
    const p = provider as PipedProvider
    if (p.enabled === undefined) {
      p.enabled = true
    }
    app.discoveredProviders.push(p)
    app.emit('serverevent', {
      type: 'DISCOVERY_CHANGED',
      from: 'discovery',
      data: getProviders(app.discoveredProviders, true)
    })
  })

  app.get(`${SERVERROUTESPREFIX}/providers`, (_req: Request, res: Response) => {
    res.json(getProviders(app.config.settings.pipedProviders))
  })

  app.put(
    `${SERVERROUTESPREFIX}/runDiscovery`,
    (_req: Request, res: Response) => {
      app.discoveredProviders = []
      runDiscovery(app)
      res.json('Discovery started')
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/providers/:id`,
    (req: Request, res: Response) => {
      if (!isValidProviderBody(req.body)) {
        res.status(400).send('Invalid provider: id and options object required')
        return
      }
      updateProvider(req.params.id, req.body as ProviderRequest, res)
    }
  )

  app.post(`${SERVERROUTESPREFIX}/providers`, (req: Request, res: Response) => {
    if (!isValidProviderBody(req.body)) {
      res.status(400).send('Invalid provider: id and options object required')
      return
    }
    updateProvider(null, req.body as ProviderRequest, res)
  })

  app.delete(
    `${SERVERROUTESPREFIX}/providers/:id`,
    (req: Request, res: Response) => {
      const idx = app.config.settings.pipedProviders.findIndex(
        (p) => p.id === req.params.id
      )
      if (idx === -1) {
        res.status(401).send(`Connection with name ${req.params.id} not found`)
        return
      }
      app.config.settings.pipedProviders.splice(idx, 1)

      writeSettingsFile(app, app.config.settings, (err: Error) => {
        if (err) {
          console.error(err)
          res.status(500).send('Unable to save to settings file')
        } else {
          app.pipedProviders.stopProvider(req.params.id)
          res.type('text/plain')
          res.send('Connection deleted')
        }
      })
    }
  )

  function updateProvider(
    idToUpdate: string | null,
    provider: ProviderRequest,
    res: Response
  ) {
    const isNew = idToUpdate === undefined || idToUpdate === null
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
      if (idx !== -1) {
        app.discoveredProviders.splice(idx, 1)
      }
      app.emit('serverevent', {
        type: 'DISCOVERY_CHANGED',
        from: 'discovery',
        data: getProviders(app.discoveredProviders)
      })
    }

    const updatedProvider: PipedProvider = existing || {
      id: '',
      enabled: true,
      pipeElements: [
        {
          type: 'providers/simple',
          options: {}
        }
      ]
    }

    if (provider.options.type === 'canbus-canboatjs') {
      const uniqueNumber = parseInt(String(provider.options.uniqueNumber), 10)
      if (!isNaN(uniqueNumber)) {
        provider.options.uniqueNumber = uniqueNumber
      } else {
        provider.options.uniqueNumber = Math.floor(
          Math.random() * MAX_CANBUS_UNIQUE_NUMBER
        )
      }

      const mfgCode = parseInt(String(provider.options.mfgCode), 10)
      if (!isNaN(mfgCode)) {
        provider.options.mfgCode = mfgCode
      } else {
        if (provider.options.mfgCode !== '') delete provider.options.mfgCode
      }
    }

    if (applyProviderSettings(updatedProvider, provider, res)) {
      if (isNew) {
        app.config.settings.pipedProviders.push(updatedProvider)
      }

      writeSettingsFile(app, app.config.settings, (err: Error) => {
        if (err) {
          console.error(err)
          res.status(500).send('Unable to save to settings file')
        } else {
          if (!isNew && idToUpdate !== provider.id) {
            app.pipedProviders.stopProvider(idToUpdate!)
          }
          app.pipedProviders.restartProvider(provider.id)
          res.type('text/plain')
          res.send('Connection ' + (isNew ? 'added' : 'updated'))
        }
      })
    }
  }
}
