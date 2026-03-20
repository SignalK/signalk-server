import { NormalizedDelta, Path, Value } from './deltas'
import * as Bacon from 'baconjs'

/** @category Server API */
export interface StreamBundle {
  /**
   * Get a [Bacon JS 1.0](https://baconjs.github.io/api.html) stream for a Signal K path that will stream values from any context.
   *
   * Stream values are objects with the following structure:
   * ```javascript
   *   {
   *     path: ...,
   *     value: ...,
   *     context: ...,
   *     source: ...,
   *     $source: ...,
   *     timestamp: ...
   *   }
   * ```
   *
   * @example
   * ```javascript
   * app.streambundle
   *   .getBus('navigation.position')
   *   .onValue(pos => app.debug(pos));
   *
   * /* output
   * {
   *   path: 'navigation.position',
   *   value: { longitude: 24.7366117, latitude: 59.72493 },
   *   context: 'vessels.urn:mrn:imo:mmsi:2766160',
   *   source: {
   *     label: 'n2k-sample-data',
   *     type: 'NMEA2000',
   *     pgn: 129039,
   *     src: '43'
   *   },
   *   '$source': 'n2k-sample-data.43',
   *   timestamp: '2014-08-15T19:00:02.392Z'
   * }
   * {
   *   path: 'navigation.position',
   *   value: { longitude: 24.82365, latitude: 58.159598 },
   *   context: 'vessels.urn:mrn:imo:mmsi:2766140',
   *   source: {
   *     label: 'n2k-sample-data',
   *     type: 'NMEA2000',
   *     pgn: 129025,
   *     src: '160'
   *   },
   *   '$source': 'n2k-sample-data.160',
   *   timestamp: '2014-08-15T19:00:02.544Z'
   * }
   * *\/
   * ```
   *
   * @param path - If it is not provided the returned stream produces values for all paths.
   */
  getBus(path?: Path): Bacon.Bus<unknown, NormalizedDelta>

  /**
   * Get a [Bacon JS](https://baconjs.github.io/) stream for path from the `vessels.self` context.
   *
   * @example
   * ```javascript
   *  app.streambundle
   *    .getSelfBus('navigation.position')
   *    .onValue(pos => app.debug(pos));
   * ```
   * Output:
   * ```
   * {
   *   path: 'navigation.position',
   *   value: { longitude: 24.7366117, latitude: 59.72493 },
   *   context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
   *   source: {
   *     label: 'n2k-sample-data',
   *     type: 'NMEA2000',
   *     pgn: 129039,
   *     src: '43'
   *   },
   *   '$source': 'n2k-sample-data.43',
   *   timestamp: '2014-08-15T19:00:02.392Z'
   * }
   * {
   *   path: 'navigation.position',
   *   value: { longitude: 24.7366208, latitude: 59.7249198 },
   *   context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
   *   source: {
   *     label: 'n2k-sample-data',
   *     type: 'NMEA2000',
   *     pgn: 129025,
   *     src: '160'
   *   },
   *   '$source': 'n2k-sample-data.160',
   *   timestamp: '2014-08-15T19:00:02.544Z'
   * }
   * ```
   *
   * @param path - If it is not provided the returned stream produces values for all paths.
   */
  getSelfBus(path: Path): Bacon.Bus<unknown, NormalizedDelta>

  /**
   * Get a [Bacon JS](https://baconjs.github.io/) stream for a path in the `vessels.self` context.
   *
   * > [!NOTE]
   * > This is similar to {@link getSelfBus}, except that the stream values contain only the `value` property from the incoming deltas.
   *
   * @example
   * ```javascript
   * app.streambundle
   *   .getSelfStream('navigation.position')
   *   .onValue(pos => app.debug(pos));
   * ```
   * Output:
   * ```
   *   my-signalk-plugin { longitude: 24.736677, latitude: 59.7250108 } +600ms
   *   my-signalk-plugin { longitude: 24.736645, latitude: 59.7249883 } +321ms
   *   my-signalk-plugin { longitude: 24.7366563, latitude: 59.7249807 } +174ms
   *   my-signalk-plugin { longitude: 24.7366563, latitude: 59.724980699999996 } +503ms
   *
   * @param path - If it is not provided the returned stream produces values for all paths.
   */
  getSelfStream(path?: Path): Bacon.Bus<unknown, Value>

  /**
   * Get a list of available full data model paths maintained by the server.
   *
   * @example
   * ```javascript
   * app.streambundle.getAvailablePaths();
   * ```
   * Returns
   * ```json
   * [
   *   "navigation.speedOverGround",
   *   "navigation.courseOverGroundTrue",
   *   "navigation.courseGreatCircle.nextPoint.position",
   *   "navigation.position",
   *   "navigation.gnss.antennaAltitude",
   *   "navigation.gnss.satellites",
   *   "navigation.gnss.horizontalDilution",
   *   "navigation.gnss.positionDilution",
   *   "navigation.gnss.geoidalSeparation",
   *   "navigation.gnss.type","navigation.gnss.methodQuality",
   *   "navigation.gnss.integrity",
   *   "navigation.magneticVariation",
   * ]
   * ```
   */
  getAvailablePaths(): Path[]
}
