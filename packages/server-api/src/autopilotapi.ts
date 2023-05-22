export interface AutopilotApi {
  register: (pluginId: string, provider: AutopilotProvider) => void
  unRegister: (pluginId: string) => void
}

export interface AutopilotProvider {
  pilotType: string
  methods: AutopilotProviderMethods
}

export interface AutopilotProviderMethods {
  pluginId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getConfig: () => Promise<{ [key: string]: any }>
  engage: (enable: boolean) => Promise<void>
  setState: (state: string) => Promise<void>
  setMode: (mode: string) => Promise<void>
  setTarget: (value: number) => Promise<void>
  adjustTarget: (value: number) => Promise<void>
  tack: (port: boolean) => Promise<void>
}

export interface AutopilotProviderRegistry {
  registerAutopilotProvider: (provider: AutopilotProvider) => void
}
