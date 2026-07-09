/**
 * Vessel reference point (CCRP) correction: translate a GNSS antenna's
 * reported position to the vessel's Consistent Common Reference Point (CCRP).
 *
 * CCRP is defined as center-of-vessel on the longitudinal centerline,
 * i.e. midships at the centerline. This matches the NMEA 2000 / radar /
 * AIS industry convention for the vessel reference point.
 *
 * Body-frame convention (origin at the bow on the centerline):
 *   +x toward bow  -> points OUT through the bow; hull lies at negative x
 *   +y to port     (matches sensors.json "+ve to port, -ve to starboard")
 *
 * Body-frame positions:
 *   Antenna:  x = -fromBow         (fromBow metres aft of the bow)
 *             y = +fromCenter      (fromCenter metres to port of centerline)
 *   CCRP:     x = -lengthOverall/2 (midships, aft of the bow)
 *             y = 0
 *
 * Vector from antenna to CCRP in body frame:
 *   body_x = -(lengthOverall/2) - (-fromBow) = fromBow - lengthOverall/2
 *               (negative when antenna is forward of midships -> CCRP is aft;
 *                positive when antenna is aft of midships -> CCRP is forward)
 *   body_y = 0 - fromCenter = -fromCenter
 *               (negative when antenna is to port -> CCRP is to starboard;
 *                positive when antenna is to starboard -> CCRP is to port)
 *
 * Body→earth rotation for heading θ (true, clockwise from north, bow
 * points along +x body):
 *   At θ=0:  +x body = +north earth, +y body = -east earth (port = west).
 *   The +y body axis lies 90° counterclockwise from +x body in the
 *   horizontal earth plane, i.e. azimuth (θ - 90°).
 *     +x body in earth N/E: ( cos θ,  sin θ)
 *     +y body in earth N/E: ( sin θ, -cos θ)
 *   Therefore:
 *     north = body_x * cos θ + body_y * sin θ
 *     east  = body_x * sin θ - body_y * cos θ
 *
 * (Note: this differs from the standard NED rotation matrix because
 * +y body is port here, not starboard.)
 */

export interface AntennaOffset {
  fromBow: number
  fromCenter: number
}

export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

const EARTH_RADIUS_M = 6_378_137
const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180

export function correctPosition(
  antenna: Position,
  offset: AntennaOffset,
  lengthOverall: number,
  headingTrueRad: number
): Position {
  const bodyX = offset.fromBow - lengthOverall / 2
  const bodyY = -offset.fromCenter
  const cosH = Math.cos(headingTrueRad)
  const sinH = Math.sin(headingTrueRad)
  const north = bodyX * cosH + bodyY * sinH
  const east = bodyX * sinH - bodyY * cosH
  const latRad = antenna.latitude * DEG_TO_RAD
  const dLat = (north / EARTH_RADIUS_M) * RAD_TO_DEG
  const dLon = (east / (EARTH_RADIUS_M * Math.cos(latRad))) * RAD_TO_DEG
  // Wrap longitude into [-180, 180] so a small east/west correction
  // applied near the antimeridian doesn't emit an out-of-range value
  // (e.g. 180.0001) that downstream consumers reject. The double mod
  // handles negative inputs in JavaScript's truncated-mod semantics.
  const rawLon = antenna.longitude + dLon
  const longitude = ((((rawLon + 180) % 360) + 360) % 360) - 180
  return {
    latitude: antenna.latitude + dLat,
    longitude,
    altitude: antenna.altitude
  }
}
