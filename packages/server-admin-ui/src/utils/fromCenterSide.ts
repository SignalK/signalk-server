/**
 * Maps a GNSS antenna's signed fromCenter onto the side of the centerline it
 * is on and back. The admin UI asks for a side and a distance rather than a
 * signed number because some mobile keyboards have no minus key on a number
 * input.
 */

export type CenterlineSide = 'port' | 'starboard'

// A positive fromCenter is to starboard, like every other signed athwartships
// quantity in Signal K.
const STARBOARD_SIGN = 1

/** The side a fromCenter value is on; `fallback` when it is on the
 * centerline or unset, where the sign carries no side. */
export function sideOfFromCenter(
  fromCenter: number | null,
  fallback: CenterlineSide
): CenterlineSide {
  if (fromCenter === null || fromCenter === 0) return fallback
  return Math.sign(fromCenter) === STARBOARD_SIGN ? 'starboard' : 'port'
}

/** The signed fromCenter for a distance from the centerline on `side`. */
export function fromCenterFor(distance: number, side: CenterlineSide): number {
  // Keep zero unsigned: -0 would read back as the negative side in a sign
  // check.
  if (distance === 0) return 0
  return side === 'starboard'
    ? STARBOARD_SIGN * distance
    : -STARBOARD_SIGN * distance
}
