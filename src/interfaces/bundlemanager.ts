/*
 * Copyright 2024 Signal K
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { Express, Request, Response } from 'express'
import { createDebug } from '../debug'
import { SERVERROUTESPREFIX } from '../constants'
import {
  BundleDefinition,
  BundleInstallRequest,
  BundleInstallStatus,
  getBundleById,
  getBundleDefinitions
} from '../bundles'

const { installModule } = require('../modules')

const debug = createDebug('signalk-server:interfaces:bundlemanager')

interface BundleManagerApp {
  config: {
    configPath: string
    appPath: string
    name: string
  }
  emit: (event: string, data: unknown) => void
}

// Installation status tracking
let installStatus: BundleInstallStatus = {
  state: 'idle',
  currentStep: 0,
  totalSteps: 0,
  errors: [],
  installed: []
}

// Installation queue
const installQueue: Array<{ name: string; version?: string }> = []
let isInstalling = false

export default function (app: BundleManagerApp & Express) {
  return {
    start: function () {
      debug('Starting bundle manager')

      // GET /signalk/v1/api/wizard/bundles - List available bundles
      app.get(`${SERVERROUTESPREFIX}/wizard/bundles`, (_req: Request, res: Response) => {
        try {
          const bundles = getBundleDefinitions()
          res.json({
            bundles,
            installedBundle: getInstalledBundleId(app)
          })
        } catch (error) {
          debug('Error getting bundles:', error)
          res.status(500).json({ error: 'Failed to get bundle definitions' })
        }
      })

      // GET /signalk/v1/api/wizard/bundles/:id - Get a specific bundle
      app.get(
        `${SERVERROUTESPREFIX}/wizard/bundles/:id`,
        (req: Request, res: Response) => {
          try {
            const bundle = getBundleById(req.params.id)
            if (!bundle) {
              res.status(404).json({ error: 'Bundle not found' })
              return
            }
            res.json(bundle)
          } catch (error) {
            debug('Error getting bundle:', error)
            res.status(500).json({ error: 'Failed to get bundle' })
          }
        }
      )

      // POST /signalk/v1/api/wizard/install - Install a bundle
      app.post(
        `${SERVERROUTESPREFIX}/wizard/install`,
        async (req: Request, res: Response) => {
          try {
            const request: BundleInstallRequest = req.body

            if (!request.bundleId) {
              res.status(400).json({ error: 'bundleId is required' })
              return
            }

            const bundle = getBundleById(request.bundleId)
            if (!bundle) {
              res.status(404).json({ error: 'Bundle not found' })
              return
            }

            // Check if already installing
            if (installStatus.state === 'installing') {
              res.status(409).json({
                error: 'Installation already in progress',
                status: installStatus
              })
              return
            }

            // Start installation
            startBundleInstallation(app, bundle, request)
            res.json({
              message: `Starting installation of bundle: ${bundle.name}`,
              status: installStatus
            })
          } catch (error) {
            debug('Error starting installation:', error)
            res.status(500).json({ error: 'Failed to start installation' })
          }
        }
      )

      // GET /signalk/v1/api/wizard/status - Get installation status
      app.get(`${SERVERROUTESPREFIX}/wizard/status`, (_req: Request, res: Response) => {
        res.json(installStatus)
      })

      // POST /signalk/v1/api/wizard/cancel - Cancel installation
      app.post(`${SERVERROUTESPREFIX}/wizard/cancel`, (_req: Request, res: Response) => {
        if (installStatus.state === 'installing') {
          // Clear the queue but can't stop current npm install
          installQueue.length = 0
          installStatus.state = 'error'
          installStatus.errors.push('Installation cancelled by user')
          emitStatusUpdate(app)
          res.json({ message: 'Installation cancelled' })
        } else {
          res.status(400).json({ error: 'No installation in progress' })
        }
      })

      // POST /signalk/v1/api/wizard/reset - Reset installation status
      app.post(`${SERVERROUTESPREFIX}/wizard/reset`, (_req: Request, res: Response) => {
        resetInstallStatus()
        res.json({ message: 'Installation status reset', status: installStatus })
      })
    },

    stop: () => {
      debug('Stopping bundle manager')
    }
  }
}

/**
 * Reset installation status to idle
 */
function resetInstallStatus() {
  installStatus = {
    state: 'idle',
    currentStep: 0,
    totalSteps: 0,
    errors: [],
    installed: []
  }
  installQueue.length = 0
  isInstalling = false
}

/**
 * Start installing a bundle
 */
function startBundleInstallation(
  app: BundleManagerApp,
  bundle: BundleDefinition,
  request: BundleInstallRequest
) {
  // Determine which plugins and webapps to install
  const pluginsToInstall = request.plugins
    ? bundle.plugins.filter((p) => request.plugins!.includes(p.name))
    : bundle.plugins

  const webappsToInstall = request.webapps
    ? bundle.webapps.filter((w) => request.webapps!.includes(w.name))
    : bundle.webapps

  const totalItems = pluginsToInstall.length + webappsToInstall.length

  // Initialize status
  installStatus = {
    state: 'installing',
    bundleId: bundle.id,
    currentStep: 0,
    totalSteps: totalItems,
    errors: [],
    installed: []
  }

  // Queue all items
  installQueue.length = 0
  pluginsToInstall.forEach((p) => installQueue.push({ name: p.name }))
  webappsToInstall.forEach((w) => installQueue.push({ name: w.name }))

  debug(`Starting bundle installation: ${bundle.name} with ${totalItems} items`)
  emitStatusUpdate(app)

  // Start processing queue
  processInstallQueue(app)
}

/**
 * Process the installation queue
 */
function processInstallQueue(app: BundleManagerApp) {
  if (isInstalling) {
    return
  }

  if (installQueue.length === 0) {
    // All done
    if (installStatus.errors.length > 0) {
      installStatus.state = 'error'
    } else {
      installStatus.state = 'complete'
    }
    emitStatusUpdate(app)
    isInstalling = false
    return
  }

  isInstalling = true
  const item = installQueue.shift()!
  installStatus.currentItem = item.name
  installStatus.currentStep++
  emitStatusUpdate(app)

  debug(`Installing ${item.name} (${installStatus.currentStep}/${installStatus.totalSteps})`)

  installModule(
    app.config,
    item.name,
    item.version || '',
    // onData
    (data: Buffer) => {
      debug(`npm output: ${data.toString()}`)
    },
    // onErr
    (err: Error) => {
      debug(`npm error: ${err}`)
    },
    // onClose
    (code: number) => {
      isInstalling = false

      if (code === 0) {
        installStatus.installed.push(item.name)
        debug(`Successfully installed ${item.name}`)
      } else {
        installStatus.errors.push(`Failed to install ${item.name} (exit code: ${code})`)
        debug(`Failed to install ${item.name} with exit code ${code}`)
      }

      emitStatusUpdate(app)

      // Process next item
      setTimeout(() => processInstallQueue(app), 100)
    }
  )
}

/**
 * Emit status update via WebSocket
 */
function emitStatusUpdate(app: BundleManagerApp) {
  try {
    app.emit('serverevent', {
      type: 'WIZARD_STATUS_CHANGED',
      from: 'signalk-server',
      data: installStatus
    })
  } catch (error) {
    debug('Failed to emit status update:', error)
  }
}

/**
 * Check if a bundle is already installed (basic heuristic)
 * This checks if any of the required plugins from a bundle are installed
 */
function getInstalledBundleId(_app: BundleManagerApp): string | undefined {
  // TODO: Implement by checking installed plugins against bundle definitions
  // For now, return undefined
  return undefined
}

// Export for testing
export { resetInstallStatus, installStatus }
