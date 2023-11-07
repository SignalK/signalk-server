export type AutopilotUpdateAttrib =
  | 'mode'
  | 'state'
  | 'target'
  | 'engaged'
  | 'options'

const AUTOPILOTUPDATEATTRIBS: AutopilotUpdateAttrib[] = [
  'mode',
  'state',
  'target',
  'engaged',
  'options'
]

export const isAutopilotUpdateAttrib = (s: string) =>
  AUTOPILOTUPDATEATTRIBS.includes(s as AutopilotUpdateAttrib)

export type TackGybeDirection = 'port' | 'starboard'

export interface AutopilotApi {
  register(
    pluginId: string,
    provider: AutopilotProvider,
    primary?: boolean
  ): void
  unRegister(pluginId: string): void
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  apUpdate(pluginId: string, attrib: AutopilotUpdateAttrib, value: any): void
}

/** @see {isAutopilotProvider} ts-auto-guard:type-guard */
export interface AutopilotProvider {
  pilotType: string
  getData(): Promise<AutopilotInfo>
  getState(): Promise<string>
  setState(state: string): Promise<void>
  getMode(): Promise<string>
  setMode(mode: string): Promise<void>
  getTarget(): Promise<number>
  setTarget(value: number): Promise<void>
  adjustTarget(value: number): Promise<void>
  engage(): Promise<void>
  disengage(): Promise<void>
  tack(direction: TackGybeDirection): Promise<void>
  gybe(direction: TackGybeDirection): Promise<void>
}

export interface AutopilotStateDef {
  name: string // autopilot state
  engaged: boolean // true if state indicates actively steering
}

export interface AutopilotOptions {
  states: AutopilotStateDef[]
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
  registerAutopilotProvider(provider: AutopilotProvider): void
}
