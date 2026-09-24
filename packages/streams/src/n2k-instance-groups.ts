/*
 * The NMEA 2000 instance groups (engine, battery, tank of one type...) as
 * @signalk/n2k-signalk defines them, plus what the server adds on top:
 * device keys, the rule shape and the paths an instance is written at
 * without a rule. Paths come from n2k-signalk only; this module builds none.
 */

import {
  classifyInstance,
  defaultPrefix,
  instanceGroups
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
 * Why a value is not a rule the group table can apply, or undefined when
 * it is one. Covers the rule's shape only; target placement is the
 * server's to check.
 */
export function ruleShapeError(rule: unknown): string | undefined {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
    return 'rule must be an object'
  }
  const {
    group: groupId,
    discriminator,
    instance,
    target
  } = rule as Record<string, unknown>
  const group =
    typeof groupId === 'string' ? GROUPS_BY_ID.get(groupId) : undefined
  if (!group) return `unknown group ${String(groupId)}`
  if (group.discriminatorCodes === undefined) {
    if (discriminator !== undefined) {
      return `group ${group.id} takes no discriminator`
    }
  } else if (discriminator === undefined) {
    return `group ${group.id} requires a discriminator`
  } else if (
    typeof discriminator !== 'number' ||
    !group.discriminatorCodes.has(discriminator)
  ) {
    return `discriminator ${String(discriminator)} is not valid for group ${group.id}`
  }
  if (
    typeof instance !== 'number' ||
    !Number.isInteger(instance) ||
    instance < 0 ||
    instance > group.maxInstance
  ) {
    return `instance must be an integer 0..${group.maxInstance} for group ${group.id}`
  }
  if (typeof target !== 'string') return 'target must be a string'
  return undefined
}

// ISO 11783 NAME: bits 0-20 unique number, bits 21-31 manufacturer code.
const CAN_NAME_PATTERN = /^[0-9a-f]{1,16}$/i
const LOW_WORD_HEX_DIGITS = 8
const UNIQUE_NUMBER_BITS = 21
const UNIQUE_NUMBER_MASK = 0x1fffff
const MANUFACTURER_CODE_MASK = 0x7ff

/**
 * `<manufacturer code>:<unique number>` from a canName hex string. The key
 * survives device and system instance edits and bus address changes.
 */
export function deviceKeyFromCanName(canName: string): string | undefined {
  if (!CAN_NAME_PATTERN.test(canName)) return undefined
  const lowWord = parseInt(canName.slice(-LOW_WORD_HEX_DIGITS), 16)
  const manufacturerCode =
    (lowWord >>> UNIQUE_NUMBER_BITS) & MANUFACTURER_CODE_MASK
  return `${manufacturerCode}:${lowWord & UNIQUE_NUMBER_MASK}`
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
