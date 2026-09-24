import { useCallback, useEffect, useState } from 'react'
import type { N2kDeviceEntry } from '../../utils/sourceLabels'
import type { N2kInstanceRule } from '../../store'

// NMEA 2000 lookup labels (canboat TEMPERATURE_SOURCE, HUMIDITY_SOURCE,
// TANK_TYPE, PRESSURE_SOURCE).
export const TEMPERATURE_SOURCE_LABELS: Record<number, string> = {
  0: 'Sea Temperature',
  1: 'Outside Temperature',
  2: 'Inside Temperature',
  3: 'Engine Room Temperature',
  4: 'Main Cabin Temperature',
  5: 'Live Well Temperature',
  6: 'Bait Well Temperature',
  7: 'Refrigeration Temperature',
  8: 'Heating System Temperature',
  9: 'Dew Point Temperature',
  10: 'Apparent Wind Chill Temperature',
  11: 'Theoretical Wind Chill Temperature',
  12: 'Heat Index Temperature',
  13: 'Freezer Temperature',
  14: 'Exhaust Gas Temperature',
  15: 'Shaft Seal Temperature'
}

export const HUMIDITY_SOURCE_LABELS: Record<number, string> = {
  0: 'Inside',
  1: 'Outside'
}

const TANK_TYPE_LABELS: Record<number, string> = {
  0: 'Fuel',
  1: 'Water',
  2: 'Gray water',
  3: 'Live well',
  4: 'Oil',
  5: 'Black water'
}

const PRESSURE_SOURCE_LABELS: Record<number, string> = {
  0: 'Atmospheric',
  1: 'Water',
  2: 'Steam',
  3: 'Compressed Air',
  4: 'Hydraulic',
  5: 'Filter',
  6: 'Altimeter Setting',
  7: 'Oil',
  8: 'Fuel'
}

/**
 * Where the server lets an instance be mapped (see src/n2k-target-policy.ts).
 * `fixed` and `branch` take `<root>.<id>`; a `location` is a full leaf path
 * whose `<id>` or `<zone>` segment takes a name; `free` is any path. `other`
 * adds any path to a branch or location. `unmapped` lists the paths the
 * instance is written at without a rule, canonical first.
 */
export type TargetEditor = (
  | { kind: 'fixed'; root: string }
  | { kind: 'branch'; branches: string[]; other?: boolean }
  | { kind: 'location'; locations: string[]; other?: boolean }
  | { kind: 'free' }
) & { unmapped: string[] }

/** One instance the device was heard sending, from GET /n2kDiscoverInstances. */
export interface DiscoveredInstance {
  pgn: number
  instance: number
  sourceLabel: string
  sourceEnum?: number
  label?: string
  hardwareChannelId?: number
  group?: string
  discriminator?: number
  editor?: TargetEditor
}

interface ChannelLabel {
  hardwareChannelId: number
  pgn?: number
  instance?: number
  label: string
}

export interface DiscoverResult {
  instances: DiscoveredInstance[]
  channelLabels: ChannelLabel[]
}

export interface InstanceScan {
  instances: DiscoveredInstance[] | null
  loading: boolean
  error: string | null
  rescan: () => void
}

/**
 * The instances a device sends, from one ~6 s listen on the bus. Starts
 * scanning on mount when enabled; `rescan` listens again.
 */
export function useN2kInstanceScan(
  device: N2kDeviceEntry,
  enabled: boolean
): InstanceScan {
  const [instances, setInstances] = useState<DiscoveredInstance[] | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch(
      `${window.serverRoutesPrefix}/n2kDiscoverInstances?src=${device.src}&sourceRef=${encodeURIComponent(device.sourceRef)}`,
      { credentials: 'include' }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<DiscoverResult>
      })
      .then((data) => {
        if (cancelled) return
        setInstances(data.instances)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, device.src, device.sourceRef, scanCount])

  const rescan = useCallback(() => {
    setLoading(true)
    setError(null)
    setScanCount((n) => n + 1)
  }, [])

  return { instances, loading, error, rescan }
}

// Mirrors the instance group table of @signalk/n2k-signalk.
export const GROUP_LABELS: Record<string, string> = {
  engine: 'Engine',
  battery: 'Battery',
  charger: 'Charger',
  inverter: 'Inverter',
  acInput: 'AC input',
  tank: 'Tank',
  temperature: 'Temperature',
  humidity: 'Humidity',
  pressure: 'Pressure',
  acConnection: 'AC connection',
  converter: 'Converter',
  dcConnection: 'DC connection'
}

const GROUP_ORDER = Object.keys(GROUP_LABELS)

export const MAPPABLE_PGNS = new Set([
  '127488',
  '127489',
  '127493',
  '127497',
  '127506',
  '127508',
  '127513',
  '127507',
  '127510',
  '127504',
  '127509',
  '127511',
  '127503',
  '127505',
  '130312',
  '130316',
  '130313',
  '130314',
  '127744',
  '127745',
  '127746',
  '127750',
  '127751'
])

// Groups whose instance prefix holds several leaves; the rest write one
// value at their full path.
const MULTI_LEAF_GROUPS: ReadonlySet<string> = new Set([
  'engine',
  'battery',
  'charger',
  'inverter',
  'tank',
  'converter',
  'dcConnection'
])

const DISCRIMINATOR_LABELS: Record<string, Record<number, string>> = {
  tank: TANK_TYPE_LABELS,
  temperature: TEMPERATURE_SOURCE_LABELS,
  humidity: HUMIDITY_SOURCE_LABELS,
  pressure: PRESSURE_SOURCE_LABELS
}

// The ENGINE_INSTANCE "no data" code, which n2k-signalk writes as the
// starboard engine like instance 1.
const ABSENT_ENGINE_INSTANCE = 255

export function hasMappablePgn(device: N2kDeviceEntry): boolean {
  return Object.keys(device.pgns ?? {}).some((pgn) => MAPPABLE_PGNS.has(pgn))
}

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group
}

export function discriminatorLabel(
  group: string,
  code: number | undefined
): string | undefined {
  if (code === undefined) return undefined
  return DISCRIMINATOR_LABELS[group]?.[code] ?? `Code ${code}`
}

export function instanceLabel(group: string, instance: number): string {
  return group === 'engine' && instance === ABSENT_ENGINE_INSTANCE
    ? 'absent'
    : String(instance)
}

type RuleIdentity = Pick<
  N2kInstanceRule,
  'group' | 'discriminator' | 'instance'
>

function ruleKey(rule: RuleIdentity): string {
  return `${rule.group}:${rule.discriminator ?? ''}:${rule.instance}`
}

export function hasMappingRule(
  rules: readonly N2kInstanceRule[] | undefined,
  identity: RuleIdentity
): boolean {
  const key = ruleKey(identity)
  return rules?.some((rule) => ruleKey(rule) === key) ?? false
}

/** One mappable instance of a device: observed on the bus, stored, or both. */
export interface MappingRow {
  key: string
  group: string
  discriminator?: number
  instance: number
  /** Undefined when the scan did not see the instance. */
  editor?: TargetEditor
}

function compareRows(a: MappingRow, b: MappingRow): number {
  return (
    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
    (a.discriminator ?? -1) - (b.discriminator ?? -1) ||
    a.instance - b.instance
  )
}

/**
 * One row per (group, discriminator, instance): the PGNs of a group
 * collapse into one row, and stored rules the scan did not see get a row
 * without an editor.
 */
export function buildMappingRows(
  instances: readonly DiscoveredInstance[],
  rules: readonly N2kInstanceRule[]
): MappingRow[] {
  const rows = new Map<string, MappingRow>()
  for (const inst of instances) {
    if (inst.group === undefined || inst.editor === undefined) continue
    const identity = {
      group: inst.group,
      discriminator: inst.discriminator,
      instance: inst.instance
    }
    const key = ruleKey(identity)
    if (!rows.has(key)) rows.set(key, { key, ...identity, editor: inst.editor })
  }
  for (const rule of rules) {
    const key = ruleKey(rule)
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        group: rule.group,
        discriminator: rule.discriminator,
        instance: rule.instance
      })
    }
  }
  return [...rows.values()].sort(compareRows)
}

const NAME_PATTERN = /^[A-Za-z0-9]+$/
// A template's one editable part: an id, a zone name, or (for the free
// kind) the whole path.
const SLOT_PATTERN = /<(id|zone|path)>/
export const PATH_SLOT = '<path>'

// The server's rule target grammar (src/n2k-target-policy.ts).
export const MAX_TARGET_LENGTH = 128
export const MAX_TARGET_SEGMENTS = 8
export const NOTIFICATIONS_ROOT = 'notifications'
export const FORBIDDEN_TARGET_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype'
])

/** The editor's chosen template and the text of its name input. */
export interface TargetValue {
  template: string
  name: string
}

export interface SlotParts {
  before: string
  slot: string
  after: string
}

export function slotParts(template: string): SlotParts | undefined {
  const match = SLOT_PATTERN.exec(template)
  if (!match) return undefined
  return {
    before: template.slice(0, match.index),
    slot: match[0],
    after: template.slice(match.index + match[0].length)
  }
}

function fill(value: TargetValue): string {
  const parts = slotParts(value.template)
  return parts ? parts.before + value.name + parts.after : value.template
}

function pathError(path: string): string | undefined {
  const segments = path.split('.')
  if (!segments.every((segment) => NAME_PATTERN.test(segment))) {
    return 'Use dot-separated segments of letters and digits'
  }
  if (segments.length > MAX_TARGET_SEGMENTS) {
    return `Use at most ${MAX_TARGET_SEGMENTS} segments`
  }
  if (path.length > MAX_TARGET_LENGTH) {
    return `Use at most ${MAX_TARGET_LENGTH} characters`
  }
  if (segments[0] === NOTIFICATIONS_ROOT) {
    return `Use a path outside ${NOTIFICATIONS_ROOT}`
  }
  const forbidden = segments.find((s) => FORBIDDEN_TARGET_SEGMENTS.has(s))
  return forbidden === undefined
    ? undefined
    : `${forbidden} is not allowed in a path`
}

function nameError(slot: string, name: string): string | undefined {
  if (slot === PATH_SLOT) return pathError(name)
  return NAME_PATTERN.test(name) ? undefined : 'Use letters and digits only'
}

// The name that fills the template's slot to give target, if any.
function nameIn(template: string, target: string): string | undefined {
  const parts = slotParts(template)
  if (!parts) return template === target ? '' : undefined
  if (
    target.length <= parts.before.length + parts.after.length ||
    !target.startsWith(parts.before) ||
    !target.endsWith(parts.after)
  ) {
    return undefined
  }
  const name = target.slice(
    parts.before.length,
    target.length - parts.after.length
  )
  return nameError(parts.slot, name) === undefined ? name : undefined
}

function specTemplates(editor: TargetEditor): string[] {
  switch (editor.kind) {
    case 'fixed':
      return [`${editor.root}.<id>`]
    case 'branch':
      return editor.branches.map((branch) => `${branch}.<id>`)
    case 'location':
      return editor.locations
    case 'free':
      return [PATH_SLOT]
  }
}

// The editor state that spells target, if its choices can: an exact option
// first, then a filled slot.
function valueOf(
  choices: readonly string[],
  target: string
): TargetValue | undefined {
  if (choices.includes(target)) return { template: target, name: '' }
  for (const template of choices) {
    const name = nameIn(template, target)
    if (name !== undefined) return { template, name }
  }
  return undefined
}

function hasOtherPath(editor: TargetEditor): boolean {
  return (
    (editor.kind === 'branch' || editor.kind === 'location') &&
    editor.other === true
  )
}

/**
 * Edited editor states by row key; null deletes an unobserved row's stored
 * path. A template outside the row's choices is a whole path, as Reset sets.
 */
export type MappingDrafts = Record<string, TargetValue | null>

export interface MappingRowState {
  row: MappingRow
  choices: string[]
  /**
   * The editor's state; undefined when the row's path does not fit its
   * choices, null when an unobserved row's path is being deleted.
   */
  value: TargetValue | null | undefined
  /** The path the instance is written at once saved. */
  target?: string
  /** The stored value this row saves as; undefined when it stores none. */
  rule?: N2kInstanceRule
  dirty: boolean
  /** The path n2k-signalk writes, when the row's path differs from it. */
  resetTo?: string
  error?: string
  /** Another row of the device writes at or around this row's path. */
  warning?: string
}

export interface MappingEvaluation {
  rows: MappingRowState[]
  rules: N2kInstanceRule[]
  dirty: boolean
  valid: boolean
}

function ruleFor(row: MappingRow, target: string): N2kInstanceRule {
  const rule: N2kInstanceRule = {
    group: row.group,
    instance: row.instance,
    target
  }
  if (row.discriminator !== undefined) rule.discriminator = row.discriminator
  return rule
}

function evaluateRow(
  row: MappingRow,
  storedRule: N2kInstanceRule | undefined,
  draft: TargetValue | null | undefined
): MappingRowState {
  const storedTarget = storedRule?.target
  if (!row.editor) {
    const deleted = draft === null
    return {
      row,
      choices: [],
      value: deleted ? null : { template: storedTarget ?? '', name: '' },
      target: deleted ? undefined : storedTarget,
      rule: deleted ? undefined : storedRule,
      dirty: deleted
    }
  }

  const { editor } = row
  const specChoices = specTemplates(editor)
  const other = hasOtherPath(editor)
  const choices = other ? [...specChoices, PATH_SLOT] : specChoices
  const edited = draft && choices.includes(draft.template) ? draft : undefined
  const parts = edited && slotParts(edited.template)
  const error = parts && nameError(parts.slot, edited.name)
  const target = edited
    ? fill(edited)
    : (draft?.template ?? storedTarget ?? editor.unmapped[0])
  // The path n2k-signalk writes is never offered as an other path; the row
  // shows it as its current path instead.
  const value =
    edited ??
    valueOf(specChoices, target) ??
    (other && !editor.unmapped.includes(target)
      ? { template: PATH_SLOT, name: target }
      : undefined)
  const rule =
    error || editor.unmapped.includes(target) ? undefined : ruleFor(row, target)
  return {
    row,
    choices,
    value,
    target,
    rule,
    dirty: error !== undefined || storedTarget !== rule?.target,
    resetTo: editor.unmapped.includes(target) ? undefined : editor.unmapped[0],
    error
  }
}

function isAtOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`)
}

const isSingleLeaf = (group: string) => !MULTI_LEAF_GROUPS.has(group)

// As on the server, a single-leaf path may sit under a multi-leaf one (an
// exhaust sensor at propulsion.main.exhaustTemperature next to the engine).
function pathsClash(
  a: string,
  aGroup: string,
  b: string,
  bGroup: string
): boolean {
  const aLeaf = isSingleLeaf(aGroup)
  if (aLeaf === isSingleLeaf(bGroup)) {
    return isAtOrUnder(a, b) || isAtOrUnder(b, a)
  }
  return aLeaf ? isAtOrUnder(b, a) : isAtOrUnder(a, b)
}

// The server does not know which instances a device has, so it cannot
// refuse a path another instance writes; the observed rows here are the
// instances the device was heard sending.
function overlapWarning(
  state: MappingRowState,
  states: readonly MappingRowState[]
): string | undefined {
  const { target } = state
  if (!state.row.editor || state.error || target === undefined) return undefined
  for (const other of states) {
    if (other === state || !other.row.editor || other.error) continue
    if (other.target === undefined) continue
    if (!pathsClash(target, state.row.group, other.target, other.row.group)) {
      continue
    }
    const writer = rowName(other.row)
    return other.target === target
      ? `${writer} also writes this path; their values will alternate.`
      : `${writer} writes ${other.target}, which overlaps this path.`
  }
  return undefined
}

/**
 * The stored values the rows save as: a row whose path is the one
 * n2k-signalk writes stores nothing. Only each editor's own form is checked
 * here; the server rejects conflicts between paths. A path another row
 * writes gets a warning that does not block saving.
 */
export function evaluateMappings(
  rows: readonly MappingRow[],
  stored: readonly N2kInstanceRule[],
  drafts: MappingDrafts
): MappingEvaluation {
  const storedByKey = new Map(stored.map((rule) => [ruleKey(rule), rule]))
  const evaluated = rows.map((row) =>
    evaluateRow(row, storedByKey.get(row.key), drafts[row.key])
  )
  const states = evaluated.map((state) => {
    const warning = overlapWarning(state, evaluated)
    return warning === undefined ? state : { ...state, warning }
  })
  return {
    rows: states,
    rules: states.flatMap((state) => (state.rule ? [state.rule] : [])),
    dirty: states.some((state) => state.dirty),
    valid: states.every((state) => state.error === undefined)
  }
}

function rowParts(row: MappingRow): string[] {
  const discriminator = discriminatorLabel(row.group, row.discriminator)
  return [
    groupLabel(row.group),
    discriminator,
    `instance ${instanceLabel(row.group, row.instance)}`
  ].filter((part): part is string => part !== undefined)
}

/** The row as its group, type and instance, for warnings. */
function rowName(row: MappingRow): string {
  return rowParts(row).join(' · ')
}

export function describeMappingRow(row: MappingRow): string {
  return rowParts(row).join(' ')
}
