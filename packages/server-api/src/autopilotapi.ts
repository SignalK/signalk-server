import { Notification, Value } from './deltas'

export type AutopilotUpdateAttrib =
  | 'mode'
  | 'state'
  | 'target'
  | 'engaged'
  | 'options'
  | 'alarm'

const AUTOPILOTUPDATEATTRIBS: AutopilotUpdateAttrib[] = [
  'mode',
  'state',
  'target',
  'engaged',
  'options',
  'alarm'
]

export const isAutopilotUpdateAttrib = (s: string) =>
  AUTOPILOTUPDATEATTRIBS.includes(s as AutopilotUpdateAttrib)

export type AutopilotAlarm =
  | 'waypointAdvance'
  | 'waypointArrival'
  | 'routeComplete'
  | 'xte'
  | 'heading'
  | 'wind'

const AUTOPILOTALARMS: AutopilotAlarm[] = [
  'waypointAdvance',
  'waypointArrival',
  'routeComplete',
  'xte',
  'heading',
  'wind'
]

export const isAutopilotAlarm = (s: string) =>
  AUTOPILOTALARMS.includes(s as AutopilotAlarm)

export type TackGybeDirection = 'port' | 'starboard'

export interface AutopilotApi {
  register(pluginId: string, provider: AutopilotProvider): void
  unRegister(pluginId: string): void
  apUpdate(
    pluginId: string,
    deviceId: string,
    attrib: AutopilotUpdateAttrib,
    value: Value
  ): void
  apAlarm(
    pluginId: string,
    deviceId: string,
    alarmName: AutopilotAlarm,
    value: Notification
  ): void
}

/** @see {isAutopilotProvider} ts-auto-guard:type-guard */
export interface AutopilotProvider {
  getData(deviceId: string): Promise<AutopilotInfo>
  getState(deviceId: string): Promise<string>
  setState(state: string, deviceId: string): Promise<boolean>
  getMode(deviceId: string): Promise<string>
  setMode(mode: string, deviceId: string): Promise<void>
  getTarget(deviceId: string): Promise<number>
  setTarget(value: number, deviceId: string): Promise<void>
  adjustTarget(value: number, deviceId: string): Promise<void>
  engage(deviceId: string): Promise<void>
  disengage(deviceId: string): Promise<void>
  tack(direction: TackGybeDirection, deviceId: string): Promise<void>
  gybe(direction: TackGybeDirection, deviceId: string): Promise<void>
  dodge(direction: TackGybeDirection, deviceId: string): Promise<void>
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
  registerAutopilotProvider(
    provider: AutopilotProvider,
    devices: string[]
  ): void
  autopilotUpdate(
    deviceId: string,
    attrib: AutopilotUpdateAttrib,
    value: Value
  ): void
  autopilotAlarm(
    deviceId: string,
    alarmName: AutopilotAlarm,
    value: Notification
  ): void
}
