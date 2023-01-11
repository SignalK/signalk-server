import {
  Plugin,
  PluginServerApp,
  AutopilotProviderRegistry
} from '@signalk/server-api'

interface DeltaUpdate {
  updates: [
    {
      values: Array<{
        path: string
        value: any
      }>
    }
  ]
}

interface AutopilotProviderApp
  extends PluginServerApp,
    AutopilotProviderRegistry {
  statusMessage?: () => string
  error: (msg: string) => void
  debug: (msg: string) => void
  setPluginStatus: (pluginId: string, status?: string) => void
  setPluginError: (pluginId: string, status?: string) => void
  setProviderStatus: (providerId: string, status?: string) => void
  setProviderError: (providerId: string, status?: string) => void
  getSelfPath: (path: string) => void
  savePluginOptions: (options: any, callback: () => void) => void
  handleMessage: (id: string | null, msg: DeltaUpdate) => void
  streambundle: {
    getSelfBus: (path: string | void) => any
  }
  config: { configPath: string }
}

const CONFIG_SCHEMA = {
  properties: {}
}

const CONFIG_UISCHEMA = {}

module.exports = (server: AutopilotProviderApp): Plugin => {
  let subscriptions: any[] = [] // stream subscriptions

  const plugin: Plugin = {
    id: 'mock-autopilot-provider',
    name: 'Autopilot Provider (mock)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (options: any, restart: any) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }

  let config: any = {}

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

      // register as provider for enabled resource types
      const result = registerProvider()

      const msg = !result
        ? `${result.toString()} not registered!`
        : `Providing: mockPilot`

      if (typeof server.setPluginStatus === 'function') {
        server.setPluginStatus(msg)
      } else {
        server.setProviderStatus(msg)
      }
    } catch (error) {
      const msg = `Started with errors!`
      server.setPluginError(msg)
      server.error('error: ' + error)
    }
  }

  const doShutdown = () => {
    server.debug(`${plugin.name} stopping.......`)
    server.debug('** Un-registering Update Handler(s) **')
    subscriptions.forEach((b) => b())
    subscriptions = []
    const msg = 'Stopped.'
    if (typeof server.setPluginStatus === 'function') {
      server.setPluginStatus(msg)
    } else {
      server.setProviderStatus(msg)
    }
  }

  const apConfig: any = {
    options: {
      state: ['enabled', 'disabled'],
      mode: ['gps', 'compass', 'wind']
    },
    state: 'disabled',
    mode: 'gps',
    target: 0
  }

  const emitDeltas = (values: Array<{ path: string; value: any }>) => {
    server.handleMessage(plugin.id, {
      updates: [
        {
          values: values
        }
      ]
    })
  }

  const deltaPath = 'steering.autopilot'

  const emitConfig = () => {
    emitDeltas([
      {
        path: `${deltaPath}.mode`,
        value: apConfig.mode
      },
      {
        path: `${deltaPath}.state`,
        value: apConfig.state
      },
      {
        path: `${deltaPath}.target`,
        value: apConfig.target
      }
    ])
  }

  const registerProvider = (): boolean => {
    try {
      server.registerAutopilotProvider({
        pilotType: 'mockPilot',
        methods: {
          getConfig: () => {
            console.log(`${plugin.id} => getConfig()`)
            return Promise.resolve(apConfig)
          },
          engage: (enable: boolean): Promise<void> => {
            apiSetState(enable ? 'enabled' : 'disabled')
            return Promise.resolve()
          },
          getState: (): Promise<string> => {
            console.log(`${plugin.id} => getMode()`)
            return Promise.resolve(apConfig.state)
          },
          setState: (state: string): Promise<void> => {
            return apiSetState(state)
          },
          getMode: (): Promise<string> => {
            console.log(`${plugin.id} => getMode()`)
            return Promise.resolve(apConfig.mode)
          },
          setMode: (mode: string): Promise<void> => {
            console.log(`${plugin.id} => setMode(${mode})`)
            if (apConfig.options.mode.includes(mode)) {
              apConfig.mode = mode
              emitDeltas([
                {
                  path: `${deltaPath}.mode`,
                  value: apConfig.mode
                }
              ])
              return Promise.resolve()
            } else {
              return Promise.reject()
            }
          },
          setTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => setTarget(${value})`)
            apConfig.target = value
            emitDeltas([
              {
                path: `${deltaPath}.target`,
                value: apConfig.target
              }
            ])
            return Promise.resolve()
          },
          adjustTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => adjustTarget(${value})`)
            apConfig.target += value
            emitDeltas([
              {
                path: `${deltaPath}.target`,
                value: apConfig.target
              }
            ])
            return Promise.resolve()
          },
          tack: (port: boolean): Promise<void> => {
            console.log(`${plugin.id} => tack ${port ? 'port' : 'starboard'}`)
            return Promise.resolve()
          }
        }
      })
      emitConfig()
      return true
    } catch (error) {
      return false
    }
  }

  const apiSetState = (state: string): Promise<void> => {
    console.log(`${plugin.id} => setState(${state})`)
    if (apConfig.options.state.includes(state)) {
      apConfig.state = state
      emitDeltas([
        {
          path: `${deltaPath}.state`,
          value: apConfig.state
        }
      ])
      return Promise.resolve()
    } else {
      return Promise.reject()
    }
  }

  return plugin
}
