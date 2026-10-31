/*
 * Where each NMEA 2000 instance group may be mapped: the per-row editor
 * description the admin UI renders, and the target check the rule
 * validation runs against that same description.
 */

import { metadataRegistry } from '@signalk/path-metadata'
import {
  defaultPrefixes,
  isAtOrUnder,
  N2kInstanceGroupId
} from '@signalk/streams/n2k-instance-groups'

export {
  FORBIDDEN_TARGET_SEGMENTS,
  MAX_TARGET_LENGTH,
  MAX_TARGET_SEGMENTS,
  NOTIFICATIONS_ROOT
} from '@signalk/streams/n2k-instance-groups'

const NAME_PATTERN = /^[A-Za-z0-9]+$/
export const ID_SLOT = '<id>'
export const ZONE_SLOT = '<zone>'
const SLOTS: ReadonlySet<string> = new Set([ID_SLOT, ZONE_SLOT])

/**
 * The target shapes a group accepts. `fixed` and `branch` take `<root>.<id>`;
 * a `location` is a full leaf path whose slot segments take a name; `free` is
 * any path the target grammar allows. `other` adds any such path to a branch
 * or location, for rows the spec has no place for.
 */
export type TargetForm =
  | { readonly kind: 'fixed'; readonly root: string }
  | {
      readonly kind: 'branch'
      readonly branches: readonly string[]
      readonly other?: true
    }
  | {
      readonly kind: 'location'
      readonly locations: readonly string[]
      readonly other?: true
    }
  | { readonly kind: 'free' }

/**
 * A row's form plus the paths the instance is written at without a rule;
 * choosing one of those removes the rule.
 */
export type TargetEditor = TargetForm & { readonly unmapped: readonly string[] }

const VESSEL_KEY = '/vessels/*/'
// path-metadata spells a name segment as a regex.
const METADATA_SLOTS: Readonly<Record<string, string>> = {
  RegExp: ID_SLOT,
  '*': ID_SLOT,
  '[A-Za-z0-9]+': ZONE_SLOT
}

function readVesselPaths(): { segments: string[]; units?: string }[] {
  const paths = []
  for (const [key, meta] of Object.entries(metadataRegistry.getAllMetadata())) {
    if (key.startsWith(VESSEL_KEY)) {
      paths.push({
        segments: key.slice(VESSEL_KEY.length).split('/'),
        units: meta.units
      })
    }
  }
  return paths
}

const VESSEL_PATHS = readVesselPaths()

// A sensor reading belongs at a spec leaf that measures the same quantity,
// and units are how path-metadata says what a leaf measures. Humidity leaves
// share `ratio` with unrelated leaves, so their name decides. A leaf under
// another match is that reading's alarm limit (warnUpper...), not a place a
// sensor reports.
function specLocations(
  accept: (leaf: string, units: string | undefined) => boolean
): string[] {
  const matches: string[] = []
  for (const { segments, units } of VESSEL_PATHS) {
    if (!accept(segments[segments.length - 1], units)) continue
    const path = segments.map((segment) => METADATA_SLOTS[segment] ?? segment)
    if (path.every((s) => SLOTS.has(s) || NAME_PATTERN.test(s))) {
      matches.push(path.join('.'))
    }
  }
  return matches.filter(
    (path) =>
      !matches.some((other) => other !== path && isAtOrUnder(path, other))
  )
}

const TANK_BRANCHES = VESSEL_PATHS.filter(
  ({ segments }) =>
    segments.length === 3 && segments[0] === 'tanks' && segments[2] === 'RegExp'
).map(({ segments }) => `tanks.${segments[1]}`)

// Dew point, wind chill and heat index are computed from other readings;
// no measured sensor belongs there.
const DERIVED_TEMPERATURE_LEAVES: ReadonlySet<string> = new Set([
  'dewPoint',
  'dewPointTemperature',
  'apparentWindChillTemperature',
  'theoreticalWindChillTemperature',
  'heatIndexTemperature'
])

const TEMPERATURE_LOCATIONS = specLocations(
  (leaf, units) => units === 'K' && !DERIVED_TEMPERATURE_LEAVES.has(leaf)
)
const TEMPERATURE: TargetForm = {
  kind: 'location',
  locations: TEMPERATURE_LOCATIONS
}
const OTHER_TEMPERATURE: TargetForm = {
  kind: 'location',
  locations: TEMPERATURE_LOCATIONS,
  other: true
}
const HUMIDITY_LOCATIONS = specLocations(
  (leaf, units) => units === 'ratio' && /humidity$/i.test(leaf)
)
const HUMIDITY: TargetForm = { kind: 'location', locations: HUMIDITY_LOCATIONS }
const OTHER_HUMIDITY: TargetForm = {
  kind: 'location',
  locations: HUMIDITY_LOCATIONS,
  other: true
}
const SPEC_PRESSURE: TargetForm = {
  kind: 'location',
  locations: specLocations((_leaf, units) => units === 'Pa')
}
const FREE: TargetForm = { kind: 'free' }

// canboat PRESSURE_SOURCE codes with a spec location; the rest (water,
// steam, compressed air, hydraulic, filter, altimeter setting) have none.
const PRESSURE_ATMOSPHERIC = 0
const PRESSURE_OIL = 7
const PRESSURE_FUEL = 8
const SPEC_PRESSURE_SOURCES: ReadonlySet<number> = new Set([
  PRESSURE_ATMOSPHERIC,
  PRESSURE_OIL,
  PRESSURE_FUEL
])

// canboat HUMIDITY_SOURCE codes with a spec location.
const HUMIDITY_INSIDE = 0
const HUMIDITY_OUTSIDE = 1
const SPEC_HUMIDITY_SOURCES: ReadonlySet<number> = new Set([
  HUMIDITY_INSIDE,
  HUMIDITY_OUTSIDE
])

// n2k-signalk writes temperature sources it has no Signal K path for
// (Shaft Seal, user-defined codes) under this root.
const GENERIC_ROOT = 'generic.'

// Wind generators, hydro-generators and fuel cells have no spec group.
const DC_SOURCE_BRANCHES: TargetForm = {
  kind: 'branch',
  branches: [
    'electrical.solar',
    'electrical.alternators',
    'electrical.batteries'
  ],
  other: true
}

const FORMS: Readonly<Record<N2kInstanceGroupId, TargetForm>> = {
  engine: { kind: 'branch', branches: ['propulsion', 'generator'] },
  battery: { kind: 'fixed', root: 'electrical.batteries' },
  charger: { kind: 'fixed', root: 'electrical.chargers' },
  inverter: { kind: 'fixed', root: 'electrical.inverters' },
  acInput: { kind: 'fixed', root: 'electrical.ac' },
  acConnection: { kind: 'fixed', root: 'electrical.ac' },
  tank: { kind: 'branch', branches: TANK_BRANCHES },
  dcConnection: DC_SOURCE_BRANCHES,
  converter: DC_SOURCE_BRANCHES,
  temperature: TEMPERATURE,
  humidity: HUMIDITY,
  pressure: SPEC_PRESSURE
}

export function targetForm(
  group: N2kInstanceGroupId,
  discriminator: number | undefined
): TargetForm {
  if (
    group === 'pressure' &&
    (discriminator === undefined || !SPEC_PRESSURE_SOURCES.has(discriminator))
  ) {
    return FREE
  }
  return FORMS[group]
}

// Temperature and humidity sources the spec has no leaf for also take any
// path.
function editorForm(
  group: N2kInstanceGroupId,
  discriminator: number | undefined,
  unmapped: readonly string[]
): TargetForm {
  if (
    group === 'temperature' &&
    unmapped.some((path) => path.startsWith(GENERIC_ROOT))
  ) {
    return OTHER_TEMPERATURE
  }
  if (
    group === 'humidity' &&
    (discriminator === undefined || !SPEC_HUMIDITY_SOURCES.has(discriminator))
  ) {
    return OTHER_HUMIDITY
  }
  return targetForm(group, discriminator)
}

/** The editor description of one instance of a device at bus address src. */
export function targetEditor(
  group: N2kInstanceGroupId,
  discriminator: number | undefined,
  instance: number,
  src: number
): TargetEditor {
  const unmapped = defaultPrefixes(group, discriminator, instance, src)
  return { ...editorForm(group, discriminator, unmapped), unmapped }
}

function isNamedUnder(target: string, root: string): boolean {
  return (
    target.startsWith(`${root}.`) &&
    NAME_PATTERN.test(target.slice(root.length + 1))
  )
}

function fillsLocation(target: string, location: string): boolean {
  const segments = target.split('.')
  const pattern = location.split('.')
  return (
    segments.length === pattern.length &&
    pattern.every((p, i) =>
      SLOTS.has(p) ? NAME_PATTERN.test(segments[i]) : p === segments[i]
    )
  )
}

/**
 * Why target is not a choice the editor offers, or undefined when it is.
 * The target grammar every kind shares, which is all `free` and `other`
 * ask for, is the caller's to check.
 */
export function targetError(
  editor: TargetEditor,
  target: string
): string | undefined {
  if (editor.unmapped.includes(target)) return undefined
  if (editor.kind !== 'fixed' && editor.kind !== 'free' && editor.other) {
    return undefined
  }
  switch (editor.kind) {
    case 'fixed':
      return isNamedUnder(target, editor.root)
        ? undefined
        : `target must be ${editor.root}.${ID_SLOT}`
    case 'branch':
      return editor.branches.some((branch) => isNamedUnder(target, branch))
        ? undefined
        : `target must be ${ID_SLOT} under one of ${editor.branches.join(', ')}`
    case 'location':
      return editor.locations.some((location) =>
        fillsLocation(target, location)
      )
        ? undefined
        : `target must be a Signal K location such as ${editor.locations[0]}`
    case 'free':
      return undefined
  }
}
