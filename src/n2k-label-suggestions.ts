/**
 * Suggest a meta.displayName for paths that NMEA 2000 devices already
 * name on the bus, so an admin can apply it instead of retyping it.
 *
 * The only per-channel names most buses carry unprompted are alert
 * texts (PGN 126985). @signalk/n2k-signalk maps those, together with
 * PGN 126983, to notifications.nmea.<type>.<category>.<system>.<alertId>
 * with the alert's message, location and data source. For a switch
 * input the data source instance is the bank and its index the channel.
 *
 * An alert on a tank or a sensor carries the same instance and index
 * fields, numbered independently of switch banks, so the alert's data
 * source NAME must also be the device that publishes the switch bank.
 * n2k-signalk carries that NAME as a JS number, which drops its lowest
 * bits; gateways such as the Maretron IPG100 send it with its 32-bit
 * halves swapped and may report a stale system instance. The comparison
 * tolerates all three. Where the switch device's NAME is not known the
 * suggestion is still made: it is only ever applied by an admin who
 * reads it, never written by the server.
 */

export interface LabelSuggestion {
  path: string
  label: string
  source: 'alertText'
  alertPath: string
}

const SWITCH_BANK_PREFIX = 'electrical.switches.bank'
const ALERT_INDEX_FIELD = 'dataSourceIndex-Source'
const CAN_NAME_RE = /^[0-9a-f]{16}$/i

const UINT64 = (1n << 64n) - 1n
const LOW_WORD = (1n << 32n) - 1n
// A 64-bit NAME as a JS number keeps 53 significant bits.
const IMPRECISE_BITS = (1n << 12n) - 1n
const SYSTEM_INSTANCE = 0xfn << 56n
const SYSTEM_INSTANCE_SWAPPED = 0xfn << 24n

interface AlertValue {
  message?: unknown
  location?: unknown
  dataSourceInstance?: unknown
  [ALERT_INDEX_FIELD]?: unknown
  dataSourceNetworkIDNAME?: unknown
}

interface TreeNode {
  value?: unknown
  $source?: unknown
  meta?: { displayName?: unknown }
  [key: string]: unknown
}

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object'
}

function getNode(root: unknown, segments: string[]): TreeNode | undefined {
  let cursor: unknown = root
  for (const segment of segments) {
    if (!isObject(cursor)) return undefined
    cursor = cursor[segment]
  }
  return isObject(cursor) ? (cursor as TreeNode) : undefined
}

function alertLabel(alert: AlertValue): string | undefined {
  const message = typeof alert.message === 'string' ? alert.message.trim() : ''
  if (!message) return undefined
  const location =
    typeof alert.location === 'string' ? alert.location.trim() : ''
  // Place first, the way circuits are usually named ("Galley CO").
  return location ? `${location} ${message}` : message
}

function hasDisplayName(node: TreeNode): boolean {
  const name = node.meta?.displayName
  return typeof name === 'string' && name.trim() !== ''
}

function deviceCanName(
  sources: unknown,
  sourceRef: unknown
): bigint | undefined {
  if (typeof sourceRef !== 'string') return undefined
  const dot = sourceRef.indexOf('.')
  if (dot === -1) return undefined
  const label = sourceRef.slice(0, dot)
  const suffix = sourceRef.slice(dot + 1)
  const canName = CAN_NAME_RE.test(suffix)
    ? suffix
    : getNode(sources, [label, suffix, 'n2k'])?.canName
  return typeof canName === 'string' && CAN_NAME_RE.test(canName)
    ? BigInt(`0x${canName}`)
    : undefined
}

export function isSameDevice(alertName: number, canName: bigint): boolean {
  if (!Number.isInteger(alertName) || alertName < 0) {
    return false
  }
  const alert = BigInt(alertName)
  const swapped = ((canName & LOW_WORD) << 32n) | (canName >> 32n)
  return (
    [
      [canName, SYSTEM_INSTANCE],
      [swapped, SYSTEM_INSTANCE_SWAPPED]
    ] as const
  ).some(([name, systemInstance]) => {
    const mask = UINT64 & ~(IMPRECISE_BITS | systemInstance)
    return (BigInt(Number(name)) & mask) === (alert & mask)
  })
}

function collectAlerts(
  node: unknown,
  path: string,
  out: { path: string; alert: AlertValue }[]
): void {
  if (!isObject(node)) return
  if ('value' in node) {
    const value = node.value
    if (isObject(value) && 'dataSourceInstance' in value) {
      out.push({ path, alert: value as AlertValue })
    }
    return
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'meta' || key === 'values' || key === '$source') continue
    collectAlerts(child, `${path}.${key}`, out)
  }
}

export function buildLabelSuggestions(
  selfTree: unknown,
  sources: unknown
): LabelSuggestion[] {
  const alerts: { path: string; alert: AlertValue }[] = []
  collectAlerts(
    getNode(selfTree, ['notifications', 'nmea']),
    'notifications.nmea',
    alerts
  )

  const suggestions: LabelSuggestion[] = []
  const seen = new Set<string>()
  for (const { path: alertPath, alert } of alerts) {
    const instance = alert.dataSourceInstance
    const index = alert[ALERT_INDEX_FIELD]
    if (!Number.isInteger(instance) || !Number.isInteger(index)) continue
    const label = alertLabel(alert)
    if (!label) continue

    const state = getNode(selfTree, [
      ...SWITCH_BANK_PREFIX.split('.'),
      String(instance),
      String(index),
      'state'
    ])
    if (!state || state.value === undefined || hasDisplayName(state)) continue
    const alertName = alert.dataSourceNetworkIDNAME
    const canName = deviceCanName(sources, state.$source)
    if (
      typeof alertName === 'number' &&
      canName !== undefined &&
      !isSameDevice(alertName, canName)
    ) {
      continue
    }

    const path = `${SWITCH_BANK_PREFIX}.${instance}.${index}.state`
    const key = `${path}\0${label}`
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push({ path, label, source: 'alertText', alertPath })
  }

  return suggestions.sort(
    (a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true }) ||
      a.alertPath.localeCompare(b.alertPath, undefined, { numeric: true })
  )
}
