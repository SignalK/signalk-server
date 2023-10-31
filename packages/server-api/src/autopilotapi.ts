export interface AutopilotApi {
  register: (pluginId: string, provider: AutopilotProvider, prmary?: boolean) => void
  unRegister: (pluginId: string) => void
}

export type TackGybeDirection = 'port' | 'starboard'

export interface AutopilotProvider {
  pilotType: string
  getData: () => Promise<AutopilotInfo>
  getState: () => Promise<string>
  setState: (state: string) => Promise<void>
  getMode: () => Promise<string>
  setMode: (mode: string) => Promise<void>
  getTarget: () => Promise<number>
  setTarget: (value: number) => Promise<void>
  adjustTarget: (value: number) => Promise<void>
  engage: () => Promise<void>
  disengage: () => Promise<void>
  tack: (direction: TackGybeDirection) => Promise<void>
  gybe: (direction: TackGybeDirection) => Promise<void>
}

export interface AutopilotOptions {
  states: string[]
  modes: string[]
}

export interface AutopilotInfo {
  options: AutopilotOptions
  target: number | null
  mode: string | null
  state: string | null
  engaged: boolean
}

export interface AutopilotProviderRegistry {
  registerAutopilotProvider: (provider: AutopilotProvider) => void
}
