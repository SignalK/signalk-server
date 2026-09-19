/**
 * The order an operator reads the active alert list in.
 *
 * IMO MSC.302(87) 9.16 and IEC 62682 6.4.2.1: emergencies first, then whatever
 * still needs an operator, most urgent and most recent first. Silencing is
 * orthogonal to all of it and never moves an alert, which is why nothing here
 * reads the silenced flag.
 */

import { PRIORITY_RANK, type Alert, type AlertState } from './types'

const STATE_TIER: Record<AlertState, number> = {
  unacknowledged: 0,
  'rtn-unacknowledged': 1,
  acknowledged: 2,
  normal: 3
}

function compareForDisplay(a: Alert, b: Alert): number {
  const emergency =
    Number(b.priority === 'emergency') - Number(a.priority === 'emergency')
  if (emergency !== 0) {
    return emergency
  }

  const tier = STATE_TIER[a.state] - STATE_TIER[b.state]
  if (tier !== 0) {
    return tier
  }

  const priority = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
  if (priority !== 0) {
    return priority
  }

  // Both are `toISOString()` output, so byte order is chronological order.
  if (b.stateChangedAt === a.stateChangedAt) {
    return 0
  }
  return b.stateChangedAt > a.stateChangedAt ? 1 : -1
}

export function sortForDisplay(alerts: Alert[]): Alert[] {
  return [...alerts].sort(compareForDisplay)
}
