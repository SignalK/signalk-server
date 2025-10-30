import {
  Plugin,
  ServerAPI,
  ResourceProviderRegistry,
  SIGNALKRESOURCETYPES
} from '@signalk/server-api'

import { FileStore, getUuid } from './lib/filestorage'
import { StoreRequestParams } from './types'
import { IRouter, Request, Response } from 'express'
import * as openapi from './openApi.json'

interface ResourceProviderApp extends ServerAPI, ResourceProviderRegistry {}

interface ProviderSettings {
  standard: {
    routes: boolean
    waypoints: boolean
    notes: boolean
    regions: boolean
    charts: boolean
  }
  custom: Array<{ name: string; description: string }>
}

const CONFIG_SCHEMA = {
  properties: {
    standard: {
      type: 'object',
      title: 'Resources (standard)',
      description:
        'ENABLE / DISABLE provider for the following SignalK resource types.',
      properties: {
        routes: {
          type: 'boolean',
          title: 'ROUTES'
        },
        waypoints: {
          type: 'boolean',
          title: 'WAYPOINTS'
        },
        notes: {
          type: 'boolean',
          title: 'NOTES'
        },
        regions: {
          type: 'boolean',
          title: 'REGIONS'
        },
        charts: {
          type: 'boolean',
          title: 'CHART SOURCES'
        }
      }
    },
    custom: {
      type: 'array',
      title: 'Resources (custom)',
      description: 'Add provider for custom resource collections.',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            title: 'Collection Name',
            description: '/signalk/v2/api/resources/{name}'
          },
          description: {
            type: 'string',
            title: 'Description',
            description: 'Type of resource in this collection.'
          }
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {
  standard: {
    routes: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': '/signalk/v2/api/resources/routes'
    },
    waypoints: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': '/signalk/v2/api/resources/waypoints'
    },
    notes: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': '/signalk/v2/api/resources/notes'
    },
    regions: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': '/signalk/v2/api/resources/regions'
    },
    charts: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': '/signalk/v2/api/resources/charts'
    }
  }
}

module.exports = (server: ResourceProviderApp): Plugin => {
  let restart: (settings: object) => void

  const plugin: Plugin = {
    id: 'resources-provider',
    name: 'Resources Provider (built-in)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (settings, restartPlugin) => {
      restart = restartPlugin
      doStartup(settings as ProviderSettings)
    },
    stop: () => {
      doShutdown()
    },
    registerWithRouter(router) {
      initMgtEndpoints(router)
    },
    getOpenApi: () => openapi
  }

  const db: FileStore = new FileStore(plugin.id, server.debug)
  let config: ProviderSettings

  const doStartup = (settings: ProviderSettings) => {
    try {
      server.debug(`${plugin.name} starting.......`)
      config = cleanConfig(settings)
      server.debug(`Applied config: ${JSON.stringify(config)}`)

      // compile list of enabled resource types
      let apiProviderFor: string[] = []
      Object.entries(config.standard).forEach((i) => {
        if (i[1]) {
          apiProviderFor.push(i[0])
        }
      })

      if (config.custom && Array.isArray(config.custom)) {
        const customTypes = config.custom.map(
          (i: { name: string; description?: string }) => {
            return i.name
          }
        )
        apiProviderFor = apiProviderFor.concat(customTypes)
      }

      server.debug(
        `** Enabled resource types: ${JSON.stringify(apiProviderFor)}`
      )

      // initialise resource storage
      db.init({ settings: config, basePath: server.getDataDirPath() })
        .then((res: { error: boolean; message: string }) => {
          if (res.error) {
            const msg = `*** ERROR: ${res.message} ***`
            server.error(msg)
            server.setPluginError(msg)
          }

          server.debug(
            `** ${plugin.name} started... ${!res.error ? 'OK' : 'with errors!'}`
          )

          // register as provider for enabled resource types
          const result = registerProviders(apiProviderFor)

          if (result.length !== 0) {
            server.setPluginError(
              `Error registering providers: ${result.toString()}`
            )
          } else {
            server.setPluginStatus(`Providing: ${apiProviderFor.toString()}`)
          }
        })
        .catch((e: Error) => {
          server.debug(e.message)
          const msg = `Initialisation Error! See console for details.`
          server.setPluginError(msg)
        })
    } catch (error) {
      const msg = `Started with errors!`
      server.setPluginError(msg)
      server.error('error: ' + error)
    }
  }

  const doShutdown = () => {
    server.debug(`${plugin.name} stopping.......`)
    server.debug('** Un-registering Update Handler(s) **')
    const msg = 'Stopped.'
    server.setPluginStatus(msg)
  }

  /** process changes in config schema */
  const cleanConfig = (options: ProviderSettings): ProviderSettings => {
    server.debug(`Check / Clean loaded settings...`)

    const defaultConfig: ProviderSettings = {
      standard: {
        routes: true,
        waypoints: true,
        notes: true,
        regions: true,
        charts: true
      },
      custom: []
    }

    // set / save defaults if no saved settings
    if (!options?.standard) {
      server.savePluginOptions(defaultConfig, () => {
        server.debug(`Default configuration applied...`)
      })
      return defaultConfig
    }

    // check / clean settings
    if (!Array.isArray(options?.custom)) {
      options.custom = []
    }
    options.custom.forEach((i: { name: string; description?: string }) => {
      i.description = i.description ?? ''
    })

    SIGNALKRESOURCETYPES.forEach((r) => {
      if (!(r in options.standard)) {
        options.standard[r] = true
      }
    })

    options.custom = options.custom.filter(
      (i) => !(i.name in defaultConfig.standard)
    )

    server.savePluginOptions(options, () => {
      server.debug(`Configuration cleaned and saved...`)
    })

    return options
  }

  /** plugin management endpoints */
  const initMgtEndpoints = (router: IRouter) => {
    const ApiResponses = {
      ok: {
        state: 'COMPLETED',
        statusCode: 200,
        message: 'OK'
      },
      invalid: {
        state: 'FAILED',
        statusCode: 400,
        message: `Invalid Data supplied!`
      },
      notFound: {
        state: 'FAILED',
        statusCode: 400,
        message: `Entry not found!`
      },
      unauthorised: {
        state: 'FAILED',
        statusCode: 403,
        message: 'Unauthorised'
      },
      exists: {
        state: 'FAILED',
        statusCode: 400,
        message: 'Collection already exists!'
      },
      errorCreate: {
        state: 'FAILED',
        statusCode: 500,
        message: 'Error creating collection!'
      }
    }

    // add new resource collection
    router.post(
      '/_config/:rescollection',
      async (req: Request, res: Response) => {
        server.debug('Add collection request...', req.params)
        if (!req.params.rescollection) {
          res.status(ApiResponses.invalid.statusCode).json(ApiResponses.invalid)
          return
        }
        const e = config.custom.find(
          (i) => i.name.toLowerCase() === req.params.rescollection.toLowerCase()
        )
        if (e || req.params.rescollection.toLowerCase() in config.standard) {
          res.status(ApiResponses.exists.statusCode).json(ApiResponses.exists)
          return
        }
        server.debug('****** Creating collection ***')
        const coll: { [key: string]: boolean } = {}
        coll[req.params.rescollection] = true
        const r = await db.createSavePaths(coll)
        if (r.error) {
          server.debug(r.message)
          res
            .status(ApiResponses.errorCreate.statusCode)
            .json(ApiResponses.errorCreate)
        } else {
          config.custom.push({
            name: req.params.rescollection,
            description: req.body.description ?? ''
          })
          server.savePluginOptions(config, () => {
            server.debug('settings saved...')
          })
          res.status(200).json(ApiResponses.ok)
          restart(config)
        }
      }
    )
    // remove resource collection config (does not remove folder of files.)
    router.delete(
      '/_config/:rescollection',
      async (req: Request, res: Response) => {
        server.debug('Remove collection request...', req.params)
        if (!req.params.rescollection) {
          res.status(ApiResponses.invalid.statusCode).json(ApiResponses.invalid)
          return
        }
        const e = config.custom.findIndex(
          (i) => i.name.toLowerCase() === req.params.rescollection.toLowerCase()
        )
        if (e === -1) {
          res
            .status(ApiResponses.notFound.statusCode)
            .json(ApiResponses.notFound)
          return
        }
        if (req.params.rescollection.toLowerCase() in config.standard) {
          res.status(ApiResponses.invalid.statusCode).json(ApiResponses.invalid)
          return
        }
        server.debug('****** Removing collection ***')
        config.custom.splice(e, 1)
        server.savePluginOptions(config, () => {
          server.debug('settings saved...')
        })
        res.status(200).json(ApiResponses.ok)
        restart(config)
      }
    )
    // get configuration
    router.get('/_config', (req: Request, res: Response) => {
      res.json(config)
    })
  }

  const getVesselPosition = () => {
    const p = server.getSelfPath('navigation.position')
    return p && p.value ? [p.value.longitude, p.value.latitude] : null
  }

  const registerProviders = (resTypes: string[]): string[] => {
    const failed: string[] = []
    resTypes.forEach((resType) => {
      try {
        server.registerResourceProvider({
          type: resType,
          methods: {
            listResources: (params: object) => {
              return apiGetResources(resType, params)
            },
            getResource: (id: string, property?: string) => {
              return db.getResource(resType, getUuid(id), property)
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setResource: (id: string, value: any) => {
              return apiSetResource(resType, id, value)
            },
            deleteResource: (id: string) => {
              return apiSetResource(resType, id, null)
            }
          }
        })
      } catch (_error) {
        failed.push(resType)
      }
    })
    return failed
  }

  // Signal K server Resource Provider interface functions

  const apiGetResources = async (
    resType: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> => {
    if (typeof params.position === 'undefined') {
      params.position = getVesselPosition()
    }
    server.debug(`*** apiGetResource:  ${resType}, ${JSON.stringify(params)}`)
    return await db.getResources(resType, params)
  }

  const apiSetResource = async (
    resType: string,
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): Promise<void> => {
    server.debug(`*** apiSetResource:  ${resType}, ${id}, ${value}`)
    const r: StoreRequestParams = {
      type: resType,
      id,
      value
    }
    return await db.setResource(r)
  }

  return plugin
}
