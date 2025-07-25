import { Value } from './deltas'

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
    apInfo: { [path: string]: Value }
  ): void
}

/** @see {isAutopilotProvider} ts-auto-guard:type-guard */
export interface AutopilotProvider {
  /**
   * This method returns an AutopilotInfo object containing the current data values and valid options for the supplied autopilot device identifier.
   *
   * > [!NOTE]
   * > It is the responsibility of the autopilot provider plugin to map the value of `engaged` to the current `state`.
   *
   * @example
   * API request:
   * ```
   * GET /signalk/v2/api/vessels/self/autopilots/mypilot1
   * ```
   *
   * AutopilotProvider method invocation:
   * ```javascript
   * getData('mypilot1');
   *
   * // Returns:
   * {
   *   options: {
   *     states: [
   *         {
   *             name: 'auto' // autopilot state name
   *             engaged: true // actively steering
   *         },
   *         {
   *             name: 'standby' // autopilot state name
   *             engaged: false // not actively steering
   *         }
   *     ]
   *     modes: ['compass', 'gps', 'wind'],  // supported modes of operation
   *     actions: ['tack', 'gybe']  // actions the autopilot supports
   * },
   *   target: 0.326
   *   mode: 'compass'
   *   state: 'auto'
   *   engaged: true
   * }
   * ```
   *
   * @param deviceId - identifier of the autopilot device to query.
   */
  getData(deviceId: string): Promise<AutopilotInfo>

  /**
   * Returns the current state of the supplied autopilot device identifier. If the autopilot device is not connected or unreachable then `off-line` should be returned.
   *
   * @example
   * API request
   * ```
   * GET /signalk/v2/api/vessels/self/autopilots/mypilot1/state
   * ```
   *
   * AutopilotProvider method invocation
   * ```javascript
   * await getState('mypilot1'); // Returns: 'auto'
   * ```
   *
   * @param deviceId - identifier of the autopilot device to query.
   */
  getState(deviceId: string): Promise<string | null>

  /**
   * Sets the autopilot device with the supplied identifier to the supplied state value.
   *
   * @example
   * API request
   * ```
   * PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/state {value: "standby"}
   * ```
   *
   * AutopilotProvider method invocation
   * ```javascript
   * setState('standby', 'mypilot1');
   * ```
   *
   * @param state - state value to set. Must be a valid state value.
   * @param deviceId - identifier of the autopilot device to query.
   * @throws if supplied state value is invalid.
   */
  setState(state: string, deviceId: string): Promise<void>

  getMode(deviceId: string): Promise<string | null>
  /**
   * Sets the autopilot device with the supplied identifier to the supplied mode value.
   *
   * @example
   * API request
   * ```
   * PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/mode {value: "gps"}
   * ```
   * AutopilotProvider method invocation
   * ```javascript   *
   * setMode('gps', 'mypilot1');
   * ```
   *
   * @param mode - Must be a valid mode value.
   * @param deviceId - identifier of the autopilot device to query.
   * @throws if supplied mode value is invalid.
   */
  setMode(mode: string, deviceId: string): Promise<void>
  getTarget(deviceId: string): Promise<number | null>

  /**
   * Sets target for the autopilot device with the supplied identifier to the supplied value.
   *
   * @example
   * API request
   * ```
   * PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/target {value: 129}
   * ```
   *
   * // AutopilotProvider method invocation
   * ```javascript
   * setTarget(129, 'mypilot1');
   * ```
   *
   * @param value - target value in radians.
   * @param deviceId - identifier of the autopilot device to query.
   * @throws if supplied target value is outside the valid range.
   */
  setTarget(value: number, deviceId: string): Promise<void>

  /**
   * Adjusts target for the autopilot device with the supplied identifier by the supplied value.
   *
   * @example
   * API request
   * ```
   * PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/target {value: 2}
   * ```
   * AutopilotProvider method invocation
   * ```javascript
   * adjustTarget(2, 'mypilot1');
   * ```
   *
   * @param value - value in radians to add to current target value.
   * @param deviceId - identifier of the autopilot device to query.
   * @throws if supplied target value is outside the valid range.
   */
  adjustTarget(value: number, deviceId: string): Promise<void>

  /**
   * Sets the state of the autopilot device with the supplied identifier to a state that is actively steering the vessel.
   *
   * @example
   * API request
   * ```
   * POST /signalk/v2/api/vessels/self/autopilots/mypilot1/engage
   * ```
   * AutopilotProvider method invocation
   * ```javascript
   * engage('mypilot1');
   * ```
   *
   * @param deviceId - identifier of the autopilot device to query.
   * @throws on error.
   */
  engage(deviceId: string): Promise<void>

  /**
   * **`disengage(deviceId)`**: This method sets the state of the autopilot device with the supplied identifier to a state that is NOT actively steering the vessel.
   *
   * @example
   * API request
   * ```
   * POST /signalk/v2/api/vessels/self/autopilots/mypilot1/disengage
   * ```
   * AutopilotProvider method invocation
   * ```javascript
   * disengage('mypilot1');
   * ```
   *
   * @param deviceId - identifier of the autopilot device to query.
   * @throws on error.
   */
  disengage(deviceId: string): Promise<void>

  /**
   * Instructs the autopilot device with the supplied identifier to perform a tack in the supplied direction.
   *
   * @example
   * API request
   * ```
   * POST /signalk/v2/api/vessels/self/autopilots/mypilot1/tack/port
   * ```
   * AutopilotProvider method invocation
   * ```javascript
   * tack('port', 'mypilot1');
   * ```
   *
   * @param direction - `port` or `starboard`
   * @param deviceId - identifier of the autopilot device to query.
   * @throws on error.
   */
  tack(direction: TackGybeDirection, deviceId: string): Promise<void>

  /**
   * **`gybe(direction, deviceId)`**: This method instructs the autopilot device with the supplied identifier to perform a gybe in the supplied direction.
   *
   * @example
   * API request
   * ```
   * POST /signalk/v2/api/vessels/self/autopilots/mypilot1/gybe/starboard
   * ```
   * AutopilotProvider method invocation
   * ```javascript
   * gybe('starboard', 'mypilot1');
   * ```
   *
   * @param direction - `port` or `starboard`
   * @param deviceId - identifier of the autopilot device to query.
   * @throws on error.
   */
  gybe(direction: TackGybeDirection, deviceId: string): Promise<void>

  /**
   * Instructs the autopilot device with the supplied identifier to enter / exit dodge mode and alter the current course by the supplied value (radians) direction.
   *
   * @example
   * To address different pilot behaviour, the `dodge` function can be used in the following ways:
   *
   * **1. Enter dodge mode at the current course**
   * ```javascript
   * // API request
   * POST /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge
   *
   * // _AutopilotProvider method invocation
   * dodge(0, 'mypilot1');
   * ```
   *
   * **2. Enter dodge mode and change course**
   * ```javascript
   * // API request
   * PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge {"value": 5}
   *
   * // AutopilotProvider method invocation
   * dodge(5, 'mypilot1');
   * ```
   *
   * **3. Cancel dodge mode**
   * ```javascript
   * // API request
   * DELETE /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge
   *
   * // AutopilotProvider method invocation
   * dodge(null, 'mypilot1');
   * ```
   *
   * @param value - +/- value in radians 'port (-ive)' or 'starboard' to change direction. _Setting the value to `null` indicates exit of dodge mode._
   * @param deviceId - identifier of the autopilot device to query.
   * @throws on error.
   */
  dodge(value: number | null, deviceId: string): Promise<void>
}

export interface AutopilotStateDef {
  name: string // autopilot state
  engaged: boolean // true if state indicates actively steering
}

export interface AutopilotOptions {
  states: AutopilotStateDef[]
  modes: string[]
  actions: string[]
}

export interface AutopilotInfo {
  options: AutopilotOptions
  target: number | null
  mode: string | null
  state: string | null
  engaged: boolean
}

/**
 * @hidden visible through ServerAPI
 */
export interface AutopilotProviderRegistry {
  /**
   * @category Autopilot API
   */
  registerAutopilotProvider(
    provider: AutopilotProvider,
    devices: string[]
  ): void

  /**
   * @category Autopilot API
   * @param deviceId - the autopilot device identifier
   * @param apInfo - object containing values keyed by {@link AutopilotInfo}
   */
  autopilotUpdate(deviceId: string, apInfo: { [path: string]: Value }): void
}
