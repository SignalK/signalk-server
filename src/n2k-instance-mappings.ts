/*
 * Per-device rules that move an NMEA 2000 instance group's Signal K paths
 * to a user-chosen prefix: validation, the admin REST routes and the cache
 * prune that runs when a device's rules change. The NMEA 2000 conversion
 * stream applies the rules; it reloads them on N2KINSTANCEMAPPINGS.
 */

import { Request, Response } from 'express'
import { Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { getEnumerationName } from '@canboat/ts-pgns'
import {
  defaultPrefixes,
  deviceKeyFromCanName,
  instanceRuleKey,
  isAtOrUnder,
  N2K_INSTANCE_GROUPS,
  N2K_INSTANCE_MAPPINGS_EVENT,
  N2kInstanceGroup,
  N2kInstanceGroupId,
  N2kInstanceMappings,
  N2kInstanceRule,
  ruleShapeError
} from '@signalk/streams/n2k-instance-groups'
import { SERVERROUTESPREFIX } from './constants'
import {
  FORBIDDEN_TARGET_SEGMENTS,
  MAX_TARGET_LENGTH,
  MAX_TARGET_SEGMENTS,
  NOTIFICATIONS_ROOT,
  targetEditor,
  targetError
} from './n2k-target-policy'

const MAX_RULES = 64
const TARGET_PATTERN = new RegExp(
  `^[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+){0,${MAX_TARGET_SEGMENTS - 1}}$`
)
// Highest claimable NMEA 2000 source address.
const MAX_BUS_ADDRESS = 253
const DEVICE_KEY_PATTERN = /^\d+:\d+$/

const rulesSchema = Type.Array(
  Type.Object(
    {
      group: Type.String(),
      discriminator: Type.Optional(Type.Integer({ minimum: 0 })),
      instance: Type.Integer({ minimum: 0 }),
      target: Type.String({ maxLength: MAX_TARGET_LENGTH })
    },
    { additionalProperties: false }
  ),
  { maxItems: MAX_RULES }
)

const GROUPS = new Map<string, N2kInstanceGroup>(
  N2K_INSTANCE_GROUPS.map((group) => [group.id, group])
)

export function isDeviceKey(key: string): boolean {
  return DEVICE_KEY_PATTERN.test(key)
}

type RuleIdentity = Pick<
  N2kInstanceRule,
  'group' | 'discriminator' | 'instance'
>

function ruleKey(rule: RuleIdentity): string {
  return instanceRuleKey(rule.group, rule.discriminator, rule.instance)
}

function overlaps(a: string, b: string): boolean {
  return isAtOrUnder(a, b) || isAtOrUnder(b, a)
}

const isSingleLeaf = (rule: RuleIdentity) =>
  (GROUPS.get(rule.group) as N2kInstanceGroup).singleLeaf

// A single-leaf path may sit under a multi-leaf one (an exhaust sensor at
// propulsion.main.exhaustTemperature next to the engine at propulsion.main).
// Landing on a leaf the multi-leaf group writes itself goes unchecked:
// n2k-signalk does not list a group's leaves.
function pathsClash(
  a: string,
  aLeaf: boolean,
  b: string,
  bLeaf: boolean
): boolean {
  if (aLeaf === bLeaf) return overlaps(a, b)
  return aLeaf ? isAtOrUnder(b, a) : isAtOrUnder(a, b)
}

const targetsClash = (a: N2kInstanceRule, b: N2kInstanceRule) =>
  pathsClash(a.target, isSingleLeaf(a), b.target, isSingleLeaf(b))

const GROUP_LABELS: Readonly<Record<N2kInstanceGroupId, string>> = {
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

// canboat lookups that name each group's discriminator codes.
const DISCRIMINATOR_ENUMS: Readonly<
  Partial<Record<N2kInstanceGroupId, string>>
> = {
  tank: 'TANK_TYPE',
  temperature: 'TEMPERATURE_SOURCE',
  humidity: 'HUMIDITY_SOURCE',
  pressure: 'PRESSURE_SOURCE'
}

/** An instance as the admin UI names it: "Tank Water instance 0". */
function describeInstance(rule: RuleIdentity): string {
  const parts = [GROUP_LABELS[rule.group]]
  if (rule.discriminator !== undefined) {
    const enumName = DISCRIMINATOR_ENUMS[rule.group]
    parts.push(
      (enumName && getEnumerationName(enumName, rule.discriminator)) ||
        `Code ${rule.discriminator}`
    )
  }
  parts.push(`instance ${rule.instance}`)
  return parts.join(' ')
}

function describeRule(rule: RuleIdentity): string {
  const discriminator =
    rule.discriminator === undefined
      ? ''
      : ` discriminator ${rule.discriminator}`
  return `${rule.group}${discriminator} instance ${rule.instance}`
}

// A rule must hold wherever the device sits on the bus, so a default that
// embeds the bus address is compared at every address the target could
// name: its numeric segments, plus one address for defaults the target is
// shorter than.
function targetAddresses(target: string): number[] {
  const addresses = new Set<number>([0])
  for (const segment of target.split('.')) {
    const n = Number(segment)
    if (/^\d+$/.test(segment) && n <= MAX_BUS_ADDRESS) addresses.add(n)
  }
  return [...addresses]
}

// Defaults that do not embed the address need only one.
function candidateAddresses(rule: RuleIdentity, target: string): number[] {
  const at = (src: number) =>
    defaultPrefixes(rule.group, rule.discriminator, rule.instance, src).join()
  return at(0) === at(1) ? [0] : targetAddresses(target)
}

function checkRuleShape(raw: unknown, index: number): string | undefined {
  const error = ruleShapeError(raw)
  return error === undefined ? undefined : `rules[${index}]: ${error}`
}

function checkTargetGrammar(target: string, index: number): string | undefined {
  if (!TARGET_PATTERN.test(target)) {
    return `rules[${index}]: target must be 1-${MAX_TARGET_SEGMENTS} dot-separated alphanumeric segments`
  }
  const segments = target.split('.')
  if (segments[0] === NOTIFICATIONS_ROOT) {
    return `rules[${index}]: target must not be under ${NOTIFICATIONS_ROOT}`
  }
  const forbidden = segments.find((segment) =>
    FORBIDDEN_TARGET_SEGMENTS.has(segment)
  )
  if (forbidden !== undefined) {
    return `rules[${index}]: target must not contain the segment ${forbidden}`
  }
  return undefined
}

// A target the instance is written at without a rule, at any bus address
// the target could name, asks for no rule.
function isUnmappedTarget(rule: N2kInstanceRule): boolean {
  return candidateAddresses(rule, rule.target).some((src) =>
    defaultPrefixes(
      rule.group,
      rule.discriminator,
      rule.instance,
      src
    ).includes(rule.target)
  )
}

function checkTargetPolicy(
  rule: N2kInstanceRule,
  index: number
): string | undefined {
  const editor = targetEditor(rule.group, rule.discriminator, rule.instance, 0)
  const error = targetError(editor, rule.target)
  return error === undefined ? undefined : `rules[${index}]: ${error}`
}

export type N2kInstanceMappingsValidation =
  { ok: true; value: N2kInstanceRule[] } | { ok: false; error: string }

/**
 * Validate one device's complete rule list. A rule whose target is the
 * instance's unmapped path is dropped: choosing that path removes the rule.
 */
export function validateInstanceMappings(
  body: unknown
): N2kInstanceMappingsValidation {
  if (!Value.Check(rulesSchema, body)) {
    const first = Value.Errors(rulesSchema, body).First()
    return {
      ok: false,
      error: first
        ? `Invalid rules at ${first.path}: ${first.message}`
        : 'Invalid rules'
    }
  }

  const rules: N2kInstanceRule[] = []
  for (const [index, raw] of body.entries()) {
    const error = checkRuleShape(raw, index)
    if (error) return { ok: false, error }
    const rule: N2kInstanceRule = {
      group: raw.group as N2kInstanceGroupId,
      instance: raw.instance,
      target: raw.target
    }
    if (raw.discriminator !== undefined) rule.discriminator = raw.discriminator
    rules.push(rule)
  }

  const keys = new Set<string>()
  for (const [index, rule] of rules.entries()) {
    const key = ruleKey(rule)
    if (keys.has(key)) {
      return {
        ok: false,
        error: `rules[${index}]: more than one rule for ${describeRule(rule)}`
      }
    }
    keys.add(key)
  }

  const kept: { rule: N2kInstanceRule; index: number }[] = []
  for (const [index, rule] of rules.entries()) {
    if (isUnmappedTarget(rule)) continue
    const error =
      checkTargetGrammar(rule.target, index) ?? checkTargetPolicy(rule, index)
    if (error) return { ok: false, error }
    kept.push({ rule, index })
  }

  for (const [position, { rule }] of kept.entries()) {
    for (const { rule: other } of kept.slice(position + 1)) {
      if (targetsClash(rule, other)) {
        return {
          ok: false,
          error: `${describeInstance(other)}: target ${other.target} overlaps the target ${rule.target} of ${describeInstance(rule)}`
        }
      }
    }
  }

  return { ok: true, value: kept.map(({ rule }) => rule) }
}

/**
 * Path prefixes whose leaves one of the device's sources, at bus address
 * `src`, stops writing when its rules change from `oldRules` to `newRules`:
 * the default of an added rule, and the old target of a changed or removed
 * one that no rule still targets, each with its notifications twin. An
 * instance without a rule that shares the default rewrites it on its next
 * frame.
 */
export function prunePrefixes(
  oldRules: readonly N2kInstanceRule[],
  newRules: readonly N2kInstanceRule[],
  src: number
): string[] {
  const oldByKey = new Map(oldRules.map((rule) => [ruleKey(rule), rule]))
  const newByKey = new Map(newRules.map((rule) => [ruleKey(rule), rule]))
  // A target another rule of the device still writes keeps its live data.
  const newTargets = new Set(newRules.map((rule) => rule.target))
  const vacated: string[] = []
  const vacate = (target: string) => {
    if (!newTargets.has(target)) vacated.push(target)
  }
  for (const [key, rule] of newByKey) {
    const old = oldByKey.get(key)
    if (!old) {
      vacated.push(
        ...defaultPrefixes(rule.group, rule.discriminator, rule.instance, src)
      )
    } else if (old.target !== rule.target) {
      vacate(old.target)
    }
  }
  for (const [key, rule] of oldByKey) {
    if (!newByKey.has(key)) vacate(rule.target)
  }
  const prefixes: string[] = []
  for (const prefix of vacated) {
    for (const p of [prefix, `${NOTIFICATIONS_ROOT}.${prefix}`]) {
      if (!prefixes.includes(p)) prefixes.push(p)
    }
  }
  return prefixes
}

export interface DeviceSourceRef {
  ref: string
  src: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Every sourceRef the device currently publishes under, in both the canName
 * and the bus-address form, on every connection. Read from the sources tree
 * and from the per-source identity deltas, which can know the canName before
 * the tree does.
 */
export function findDeviceSourceRefs(
  deviceKey: string,
  sources: unknown,
  sourceDeltas: Record<string, unknown>
): DeviceSourceRef[] {
  const refs = new Map<string, number>()
  const add = (provider: unknown, canName: unknown, src: unknown) => {
    if (typeof provider !== 'string' || typeof canName !== 'string') return
    const address = Number(src)
    if (src === undefined || src === null || !Number.isInteger(address)) return
    if (deviceKeyFromCanName(canName) !== deviceKey) return
    refs.set(`${provider}.${canName}`, address)
    refs.set(`${provider}.${address}`, address)
  }

  if (isRecord(sources)) {
    for (const [provider, devices] of Object.entries(sources)) {
      if (!isRecord(devices)) continue
      for (const [subKey, device] of Object.entries(devices)) {
        const n2k = isRecord(device) ? device.n2k : undefined
        if (!isRecord(n2k)) continue
        add(provider, n2k.canName, n2k.src ?? subKey)
      }
    }
  }

  for (const delta of Object.values(sourceDeltas)) {
    const updates = isRecord(delta) ? delta.updates : undefined
    const first: unknown = Array.isArray(updates) ? updates[0] : undefined
    const source = isRecord(first) ? first.source : undefined
    if (isRecord(source)) add(source.label, source.canName, source.src)
  }

  return [...refs].map(([ref, src]) => ({ ref, src }))
}

type RouteHandler = (req: Request, res: Response) => void

export interface N2kInstanceMappingsApp {
  config: { settings: { n2kInstanceMappings?: N2kInstanceMappings } }
  securityStrategy: { addAdminMiddleware(path: string): void }
  get(path: string, handler: RouteHandler): void
  put(path: string, handler: RouteHandler): void
  emit(event: string, ...args: unknown[]): boolean
  signalk?: { sources?: unknown }
  deltaCache: {
    sourceDeltas: Record<string, unknown>
    removeSource(sourceRef: string, prefixes?: readonly string[]): void
  }
}

export type SettingsWriter = (
  settings: object,
  cb: (err?: unknown) => void
) => void

function storedRules(
  mappings: N2kInstanceMappings | undefined,
  deviceKey: string
): N2kInstanceRule[] {
  const rules = mappings?.[deviceKey]
  return Array.isArray(rules) ? rules : []
}

function fail(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ state: 'FAILED', statusCode, message })
}

const INVALID_DEVICE_KEY =
  'deviceKey must be <manufacturer code>:<unique number>'

export function registerN2kInstanceMappingRoutes(
  app: N2kInstanceMappingsApp,
  writeSettings: SettingsWriter
): void {
  const basePath = `${SERVERROUTESPREFIX}/n2kInstanceMappings`
  const devicePath = `${basePath}/:deviceKey`
  app.securityStrategy.addAdminMiddleware(basePath)

  app.get(devicePath, (req: Request, res: Response) => {
    const { deviceKey } = req.params
    if (!isDeviceKey(deviceKey)) {
      fail(res, 400, INVALID_DEVICE_KEY)
      return
    }
    res.json(storedRules(app.config.settings.n2kInstanceMappings, deviceKey))
  })

  app.put(devicePath, (req: Request, res: Response) => {
    const { deviceKey } = req.params
    if (!isDeviceKey(deviceKey)) {
      fail(res, 400, INVALID_DEVICE_KEY)
      return
    }
    const validation = validateInstanceMappings(req.body)
    if (!validation.ok) {
      fail(res, 400, validation.error)
      return
    }
    const newRules = validation.value
    const oldRules = storedRules(
      app.config.settings.n2kInstanceMappings,
      deviceKey
    )

    const updatedSettings = structuredClone(app.config.settings)
    const stored: unknown = updatedSettings.n2kInstanceMappings
    // settings.json is hand-editable; an array would drop the keyed rules
    // when serialised.
    const mappings: N2kInstanceMappings =
      isRecord(stored) && !Array.isArray(stored)
        ? (stored as N2kInstanceMappings)
        : {}
    if (newRules.length > 0) {
      mappings[deviceKey] = newRules
    } else {
      delete mappings[deviceKey]
    }
    updatedSettings.n2kInstanceMappings = mappings

    writeSettings(updatedSettings, (err) => {
      if (err) {
        fail(res, 500, 'Unable to save n2kInstanceMappings in settings file')
        return
      }
      app.config.settings = updatedSettings
      app.emit('serverAdminEvent', {
        type: N2K_INSTANCE_MAPPINGS_EVENT,
        data: mappings
      })
      for (const { ref, src } of findDeviceSourceRefs(
        deviceKey,
        app.signalk?.sources,
        app.deltaCache.sourceDeltas
      )) {
        const prefixes = prunePrefixes(oldRules, newRules, src)
        if (prefixes.length > 0) app.deltaCache.removeSource(ref, prefixes)
      }
      res.json({ state: 'COMPLETED', statusCode: 200 })
    })
  })
}
