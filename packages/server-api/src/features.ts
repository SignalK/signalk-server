/**
 * @ignore this is extended by {@link ServerAPI}, no need to document separately
 */
export interface WithFeatures {
  /**
   * Returns the available APIs and Plugins.
   *
   * _Example:_
   * ```javascript
   * let features = app.getFeatures();
   *
   * {
   *   "apis": [
   *     "resources","course"
   *   ],
   *   "plugins": [
   *     {
   *       "id": "anchoralarm",
   *       "name": "Anchor Alarm",
   *       "version": "1.13.0",
   *       "enabled": true
   *     },
   *     {
   *       "id": "autopilot",
   *       "name": "Autopilot Control",
   *       "version": "1.4.0",
   *       "enabled": false
   *     },
   *     {
   *       "id": "sk-to-nmea2000",
   *       "name": "Signal K to NMEA 2000",
   *       "version": "2.17.0",
   *       "enabled": false
   *     },
   *     {
   *       "id": "udp-nmea-sender",
   *       "name": "UDP NMEA0183 Sender",
   *       "version": "2.0.0",
   *       "enabled": false
   *     }
   *   ]
   * }
   * ```
   *
   * @param onlyEnabled
   * - `undefined` (not provided): list all features
   * - `true`: list only enabled features
   * - `false`: list only disabled features
   */
  getFeatures(onlyEnabled?: boolean): Promise<FeatureInfo>
}

/**
 * Information about the available APIs and Plugins.
 * @category Server API
 */
export interface FeatureInfo {
  apis: SignalKApiId[]
  plugins: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
  }>
}

/** @category Server API  */
export type SignalKApiId =
  | 'weather'
  | 'course'
  | 'resources'
  | 'history'
  | 'autopilot'
  | 'anchor'
  | 'logbook'
  | 'historyplayback' //https://signalk.org/specification/1.7.0/doc/streaming_api.html#history-playback
  | 'historysnapshot' //https://signalk.org/specification/1.7.0/doc/rest_api.html#history-snapshot-retrieval
