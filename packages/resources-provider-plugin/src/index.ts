import {
  Plugin,
  PluginServerApp,
  ResourceProviderRegistry,
} from '@signalk/server-api'

import { FileStore, getUuid } from './lib/filestorage'
import { StoreRequestParams } from './types'

interface ResourceProviderApp extends PluginServerApp, ResourceProviderRegistry {
  statusMessage?: () => string
  error: (msg: string) => void
  debug: (msg: string) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  setProviderStatus: (providerId: string, status?: string) => void
  setProviderError: (providerId: string, status?: string) => void
  getSelfPath: (path: string) => void
  savePluginOptions: (options: any, callback: () => void) => void
  config: { configPath: string }
}

const CONFIG_SCHEMA = {
  properties: {
    path: {
      type: 'string',
      title: 'Path to store resources:',
      description: 'File system path relative to home/<user>/.signalk',
      default: './resources'
    },
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
        }
      }
    },
    custom: {
      type: 'array',
      title: 'Resources (custom)',
      description: 'Add provider for custom resource types.',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            title: 'Resource Type',
            description: '/signalk/v2/api/resources/'
          }
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {
  path: {
    'ui:emptyValue': './resources',
    'ui:help': ' '
  },
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
    }
  }
}

module.exports = (server: ResourceProviderApp): Plugin => {
  const plugin: Plugin = {
    id: 'resources-provider',
    name: 'Resources Provider (built-in)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }

  const db: FileStore = new FileStore(plugin.id, server.debug)

  let config: any = {
    standard: {
      routes: true,
      waypoints: true,
      notes: true,
      regions: true
    },
    custom: [],
    path: './resources'
  }

  const doStartup = (options: any) => {
    try {
      server.debug(`${plugin.name} starting.......`)
      if (options && options.standard) {
        config = options
      } else {
        // save defaults if no options loaded
        server.savePluginOptions(config, () => {
          server.debug(`Default configuration applied...`)
        })
      }
      server.debug(`Applied config: ${JSON.stringify(config)}`)

      // compile list of enabled resource types
      let apiProviderFor: string[] = []
      Object.entries(config.standard).forEach((i) => {
        if (i[1]) {
          apiProviderFor.push(i[0])
        }
      })

      if (config.custom && Array.isArray(config.custom)) {
        const customTypes = config.custom.map((i: any) => {
          return i.name
        })
        apiProviderFor = apiProviderFor.concat(customTypes)
      }

      server.debug(
        `** Enabled resource types: ${JSON.stringify(apiProviderFor)}`
      )

      // initialise resource storage
      db.init({ settings: config, path: server.config.configPath })
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

          const msg =
            result.length !== 0
              ? `${result.toString()} not registered!`
              : `Providing: ${apiProviderFor.toString()}`

          server.setPluginStatus(msg)
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

  const getVesselPosition = () => {
    const p: any = server.getSelfPath('navigation.position')
    return p && p.value ? [p.value.longitude, p.value.latitude] : null
  }

  const registerProviders = (resTypes: string[]): string[] => {
    const failed: string[] = []
    resTypes.forEach((resType) => {
      try {
        server.registerResourceProvider({
          type: resType,
          methods: {
            listResources: (params: object): any => {
              return apiGetResources(resType, params)
            },
            getResource: (id: string, property?: string) => {
              return db.getResource(resType, getUuid(id), property)
            },
            setResource: (id: string, value: any) => {
              return apiSetResource(resType, id, value)
            },
            deleteResource: (id: string) => {
              return apiSetResource(resType, id, null)
            }
          }
        })
      } catch (error) {
        failed.push(resType)
      }
    })
    return failed
  }

  // Signal K server Resource Provider interface functions

  const apiGetResources = async (
    resType: string,
    params?: any
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
