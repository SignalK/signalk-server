import {
  Plugin,
  ServerAPI,
  AutopilotProviderRegistry
} from '@signalk/server-api'

interface AutopilotProviderApp
  extends ServerAPI,
    AutopilotProviderRegistry {}

const CONFIG_SCHEMA = {
  properties: {}
}

const CONFIG_UISCHEMA = {}

module.exports = (server: AutopilotProviderApp): Plugin => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subscriptions: any[] = [] // stream subscriptions

  const plugin: Plugin = {
    id: 'mock-autopilot-provider',
    name: 'Autopilot Provider (mock)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start: (options: any) => {
      doStartup(options)
    },
    stop: () => {
      doShutdown()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // register as autopilot provider
      const result = registerProvider()

      const msg = !result
        ? `${result.toString()} not registered!`
        : `Providing: mockPilot`

      server.setPluginStatus(msg)

      // initialise autopilot connection
      initialise()

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
    server.setPluginStatus(msg)
  }

  // mock autopilot config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apConfig: any = {
    options: {
      state: ['enabled', 'disabled'],
      mode: ['gps', 'compass', 'wind']
    },
    state: 'disabled',
    mode: 'gps',
    target: 0
  }

  const deltaPath = 'steering.autopilot'

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
            console.log(`${plugin.id} => engage(${enable})`)
            apSetState(enable ? 'enabled' : 'disabled')
            return Promise.resolve()
          },
          getState: (): Promise<string> => {
            console.log(`${plugin.id} => getState()`)
            return Promise.resolve(apConfig.state)
          },
          setState: (state: string): Promise<void> => {
            return apSetState(state)
          },
          getMode: (): Promise<string> => {
            console.log(`${plugin.id} => getMode()`)
            return Promise.resolve(apConfig.mode)
          },
          setMode: (mode: string): Promise<void> => {
            return apSetMode(mode)
          },
          setTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => setTarget(${value})`)
            return apSetTarget(value)
          },
          adjustTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => adjustTarget(${value})`)
            return apSetTarget(apConfig.target + value)
          },
          tack: (port: boolean): Promise<void> => {
            console.log(`${plugin.id} => tack ${port ? 'port' : 'starboard'}`)
            return Promise.resolve()
          }
        }
      })
      return true
    } catch (error) {
      return false
    }
  }

  // initialise autopilot connection / emit status
  const initialise = () => {
    server.debug('Initialising autopilot comms....')
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

  // set autopilot state
  const apSetState = (state: string): Promise<void> => {
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

  // set autopilot mode
  const apSetMode = (mode: string): Promise<void> => {
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
  }

  // set autopilot target
  const apSetTarget = (value: number): Promise<void> => {
    if (value > 359) {
      apConfig.target = 359
    } else if (value < -179) {
      apConfig.target = -179
    } else {
      apConfig.target = value
    }
    console.log(`${plugin.id} => Target value set = ${apConfig.target}`)
    emitDeltas([
      {
        path: `${deltaPath}.target`,
        value: (Math.PI/180) * apConfig.target
      }
    ])
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emitDeltas = (values: Array<{ path: string; value: any }>) => {
    server.handleMessage(plugin.id, {
      updates: [
        {
          values: values
        }
      ]
    })
  }

  return plugin
}
