/*
 * The NMEA 2000 instance groups (engine, battery, tank of one type...) as
 * @signalk/n2k-signalk defines them, plus what the server adds on top:
 * device keys, the stored rule and its n2k-signalk form, and the paths an
 * instance is written at without a rule. Paths come from n2k-signalk only;
 * this module builds none.
 */

import {
  classifyInstance,
  defaultPrefix,
  deviceIdentity,
  instanceGroups,
  validateInstancePrefixRules,
  type InstancePrefixRule,
  type InstancePrefixRuleProblem
} from '@signalk/n2k-signalk'

export type N2kInstanceGroup = (typeof instanceGroups)[number]
export type N2kInstanceGroupId = N2kInstanceGroup['id']
export type N2kFrame = Parameters<typeof classifyInstance>[0]

/**
 * The group, discriminator code and instance code of a decoded canboat frame
 * as n2k-signalk receives it. Undefined for PGNs outside the group table and
 * for frames the mapper writes no path for.
 */
export { classifyInstance }

/**
 * Grammar of a rule target, defined here so the admin UI's drift test can
 * compare its copy without importing server code.
 */
export const MAX_TARGET_LENGTH = 128
export const MAX_TARGET_SEGMENTS = 8
export const NOTIFICATIONS_ROOT = 'notifications'
/**
 * Path segments the server drops from every delta (FORBIDDEN_PATH_KEYS in
 * @signalk/server-api); a target containing one would silently lose its data.
 */
export const FORBIDDEN_TARGET_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype'
])

/** The server event that announces every device's rules. */
export const N2K_INSTANCE_MAPPINGS_EVENT = 'N2KINSTANCEMAPPINGS'

export const N2K_INSTANCE_GROUPS: readonly N2kInstanceGroup[] = instanceGroups

const GROUPS_BY_ID: ReadonlyMap<string, N2kInstanceGroup> = new Map(
  N2K_INSTANCE_GROUPS.map((group) => [group.id, group])
)

/**
 * Every Signal K path prefix the group's PGNs write this instance under
 * without a rule. Usually one; 130312 and 130316 spell some temperature
 * sources differently.
 */
export function defaultPrefixes(
  groupId: N2kInstanceGroupId,
  discriminator: number | undefined,
  instance: number,
  src: number
): string[] {
  const prefixes: string[] = []
  for (const pgn of GROUPS_BY_ID.get(groupId)?.pgns ?? []) {
    const prefix = defaultPrefix(groupId, discriminator, instance, src, pgn)
    if (prefix !== undefined && !prefixes.includes(prefix)) {
      prefixes.push(prefix)
    }
  }
  return prefixes
}

/** One key per rule identity: (group, discriminator, instance). */
export function instanceRuleKey(
  group: N2kInstanceGroupId,
  discriminator: number | undefined,
  instance: number
): string {
  return `${group}/${discriminator ?? ''}/${instance}`
}

const DOT = 46

/** True when path is prefix or lies under it on a segment boundary. */
export function isAtOrUnder(path: string, prefix: string): boolean {
  return (
    path.startsWith(prefix) &&
    (path.length === prefix.length || path.charCodeAt(prefix.length) === DOT)
  )
}

/**
 * `<manufacturer code>:<unique number>` from a canName hex string, decoded
 * as n2k-signalk matches rules. The key survives device and system instance
 * edits and bus address changes.
 */
export function deviceKeyFromCanName(canName: string): string | undefined {
  const identity = deviceIdentity(canName)
  return identity && `${identity.manufacturerCode}:${identity.uniqueNumber}`
}

/**
 * Moves one data instance of a device to another Signal K path. For a
 * single-leaf group the target is the full leaf path, otherwise it replaces
 * the instance's default prefix. `discriminator` is present exactly when the
 * group has one (tank type, sensor source).
 */
export interface N2kInstanceRule {
  group: N2kInstanceGroupId
  discriminator?: number
  instance: number
  target: string
}

/** Rules keyed by device key, `<manufacturer code>:<unique number>`. */
export type N2kInstanceMappings = Record<string, readonly N2kInstanceRule[]>

// The widths of the NAME fields a device key holds.
const MAX_MANUFACTURER_CODE = 0x7ff
const MAX_UNIQUE_NUMBER = 0x1fffff
const DEVICE_KEY_PATTERN = /^(0|[1-9]\d*):(0|[1-9]\d*)$/

// A key spelled any other way than deviceKeyFromCanName writes it names no
// device: n2k-signalk would match it by number while the server looks it up
// by string.
function parseDeviceKey(deviceKey: string) {
  const match = DEVICE_KEY_PATTERN.exec(deviceKey)
  if (!match) return undefined
  const manufacturerCode = Number(match[1])
  const uniqueNumber = Number(match[2])
  return manufacturerCode <= MAX_MANUFACTURER_CODE &&
    uniqueNumber <= MAX_UNIQUE_NUMBER
    ? { manufacturerCode, uniqueNumber }
    : undefined
}

/** True for a key deviceKeyFromCanName can return. */
export function isDeviceKey(deviceKey: string): boolean {
  return parseDeviceKey(deviceKey) !== undefined
}

/** A stored rule whose fields n2k-signalk has not checked yet. */
export type UncheckedRule = { readonly [K in keyof N2kInstanceRule]?: unknown }

/**
 * A stored rule of the device as n2k-signalk's setInstancePrefixRules takes
 * it. A malformed device key gives no manufacturer code or unique number
 * n2k-signalk accepts.
 */
export function instancePrefixRule(
  deviceKey: string,
  rule: UncheckedRule
): Record<keyof InstancePrefixRule, unknown> {
  const device = parseDeviceKey(deviceKey)
  return {
    manufacturerCode: device?.manufacturerCode ?? NaN,
    uniqueNumber: device?.uniqueNumber ?? NaN,
    group: rule.group,
    discriminator: rule.discriminator,
    instance: rule.instance,
    prefix: rule.target
  }
}

const isObject = (value: unknown): value is UncheckedRule =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface DeviceRuleCheck {
  /** The rules n2k-signalk applies, in stored order. */
  rules: N2kInstanceRule[]
  /** The same rules as setInstancePrefixRules takes them. */
  prefixRules: InstancePrefixRule[]
  /** Why each other entry is not applied; index -1 when there is no list. */
  problems: InstancePrefixRuleProblem[]
}

/**
 * Splits a device's stored rules into those n2k-signalk applies and the
 * problems of the rest. settings.json is hand-editable, so the entries are
 * unchecked until n2k-signalk validates them.
 */
export function checkDeviceRules(
  deviceKey: string,
  stored: unknown
): DeviceRuleCheck {
  if (!Array.isArray(stored)) {
    return {
      rules: [],
      prefixRules: [],
      problems: [{ index: -1, message: 'rules must be a list' }]
    }
  }
  const candidates = stored.map((entry: unknown) =>
    isObject(entry) ? instancePrefixRule(deviceKey, entry) : entry
  )
  const problems = validateInstancePrefixRules(candidates)
  const rejected = new Set(problems.map((problem) => problem.index))
  const applies = (_entry: unknown, index: number) => !rejected.has(index)
  // n2k-signalk has checked every field of the entries it accepts.
  return {
    rules: stored.filter(applies) as N2kInstanceRule[],
    prefixRules: candidates.filter(applies) as InstancePrefixRule[],
    problems
  }
}

/** The device's stored rules that n2k-signalk applies. */
export function applicableRules(
  deviceKey: string,
  stored: unknown
): N2kInstanceRule[] {
  return checkDeviceRules(deviceKey, stored).rules
}
