import {
  classifyInstance,
  defaultPrefixes,
  isAtOrUnder,
  N2K_INSTANCE_GROUPS,
  N2kFrame,
  N2kInstanceGroupId
} from '@signalk/streams/n2k-instance-groups'
import {
  getAllPGNs,
  getEnumerationName,
  getEnumerationValue
} from '@canboat/ts-pgns'
import type { MappedSources } from './n2k-instance-mappings'
import { TargetEditor, targetEditor } from './n2k-target-policy'

/**
 * Walk the self-vessel Signal K tree and derive, for each PGN known to
 * carry a `instance` primary key, which `(sourceRef, instance)` tuples
 * are *currently* present.
 *
 * This replaces an earlier passive listener that accumulated every
 * instance value ever seen on the wire. That set never forgot, so a
 * value like `instance: 0` emitted briefly during a device's startup
 * Address Claim — before the user-configured instance took effect —
 * haunted conflict detection forever.
 *
 * The SK tree is the authoritative current state: a leaf at
 * `electrical.batteries.<n>.voltage` only exists while a device is
 * actively publishing instance `<n>`. Reading instances from there
 * matches what users see in the data browser and the per-PGN editors,
 * and there is nothing to decay.
 *
 * A device with instance mappings writes some instances at user-chosen
 * paths instead. Leaves at or under one of its rule targets are credited to
 * that rule's instance and keyed as the default-path leaf would be, so
 * conflict detection compares mapped and unmapped devices on the same raw
 * instances.
 *
 * Path conventions per PGN follow the @signalk/n2k-signalk mapping
 * package. Most are `<prefix>.<instance>.<...>`; PGN 130312/130316
 * (temperature/humidity) carry an additional `source` enum that splits
 * the path as `<prefix>.<source>.<instance>.<...>`. We treat that as
 * the compound key the conflict detector already understands.
 */

// Map PGN → list of `<prefix>:<shape>` describing where in the SK tree
// the data lands. Shape is one of:
//   "<prefix>.<instance>"           — keys at depth 1 are the instance
//   "<prefix>.<source>.<instance>"  — keys at depth 1 are a string
//                                     source (e.g. "inside") and depth 2
//                                     is the numeric instance
const PGN_TREE_PATHS: Record<
  number,
  { prefix: string; shape: 'inst' | 'source-inst' }[]
> = {
  127245: [{ prefix: 'steering', shape: 'inst' }],
  127488: [{ prefix: 'propulsion', shape: 'inst' }],
  127489: [{ prefix: 'propulsion', shape: 'inst' }],
  127493: [{ prefix: 'propulsion', shape: 'inst' }],
  127497: [{ prefix: 'propulsion', shape: 'inst' }],
  127498: [{ prefix: 'propulsion', shape: 'inst' }],
  127501: [{ prefix: 'electrical.switches.bank', shape: 'inst' }],
  127503: [{ prefix: 'electrical.ac', shape: 'inst' }],
  127504: [{ prefix: 'electrical.ac', shape: 'inst' }],
  127505: [{ prefix: 'tanks', shape: 'source-inst' }],
  127506: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  127508: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  127513: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  130311: [{ prefix: 'environment', shape: 'source-inst' }],
  130312: [{ prefix: 'environment', shape: 'source-inst' }],
  130316: [{ prefix: 'environment', shape: 'source-inst' }]
}

type PgnTreePath = (typeof PGN_TREE_PATHS)[number][number]

// Per instance group, the tracked PGNs a mapped instance is reported under.
const TRACKED_PGNS_BY_GROUP = new Map<N2kInstanceGroupId, string[]>(
  N2K_INSTANCE_GROUPS.map((group) => [
    group.id,
    group.pgns.filter((pgn) => pgn in PGN_TREE_PATHS).map(String)
  ])
)

// A leaf that a rule of its source's device moved off the default paths.
function isMovedLeaf(
  mapped: MappedSources | undefined,
  sourceRef: string,
  path: string
): boolean {
  const source = mapped?.get(sourceRef)
  if (!source) return false
  for (const rule of source.rules) {
    if (isAtOrUnder(path, rule.target)) return true
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAt(root: any, dotPath: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = root
  for (const part of dotPath.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

type Accumulator<T> = Record<string, Record<string, Set<T>>>

function add<T>(out: Accumulator<T>, sourceRef: string, pgn: string, v: T) {
  let pgnMap = out[sourceRef]
  if (!pgnMap) {
    pgnMap = {}
    out[sourceRef] = pgnMap
  }
  let set = pgnMap[pgn]
  if (!set) {
    set = new Set()
    pgnMap[pgn] = set
  }
  set.add(v)
}

function materialise<T>(
  out: Accumulator<T>,
  compare?: (a: T, b: T) => number
): Record<string, Record<string, T[]>> {
  const final: Record<string, Record<string, T[]>> = {}
  for (const [src, pgnMap] of Object.entries(out)) {
    const dst: Record<string, T[]> = {}
    for (const [pgn, set] of Object.entries(pgnMap)) {
      dst[pgn] = Array.from(set).sort(compare)
    }
    final[src] = dst
  }
  return final
}

const hasMappings = (mapped: MappedSources | undefined) =>
  mapped !== undefined && mapped.size > 0

/**
 * Build sourceRef → pgn → list of currently-published instance numbers.
 * Used by the admin UI conflict detector. The shape mirrors the legacy
 * passive map so the client is unchanged.
 */
export function buildPgnDataInstancesFromTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selfTree: any,
  mapped?: MappedSources
): Record<string, Record<string, number[]>> {
  const out: Accumulator<number> = {}
  if (!selfTree || typeof selfTree !== 'object') return {}
  const filter = hasMappings(mapped) ? mapped : undefined

  for (const [pgn, paths] of Object.entries(PGN_TREE_PATHS)) {
    for (const { prefix, shape } of paths) {
      const node = getAt(selfTree, prefix)
      if (!node || typeof node !== 'object') continue

      if (shape === 'inst') {
        // Direct: <prefix>.<instance>.<...>
        for (const [instKey, instSubtree] of Object.entries(node)) {
          const inst = Number(instKey)
          if (!Number.isFinite(inst)) continue
          const path = filter && `${prefix}.${instKey}`
          for (const ref of collectSources(instSubtree, path, filter)) {
            add(out, ref, pgn, inst)
          }
        }
      } else {
        // Compound: <prefix>.<source>.<instance>.<...>
        for (const [sourceKey, sourceSubtree] of Object.entries(node)) {
          if (!sourceSubtree || typeof sourceSubtree !== 'object') continue
          for (const [instKey, instSubtree] of Object.entries(sourceSubtree)) {
            const inst = Number(instKey)
            if (!Number.isFinite(inst)) continue
            const path = filter && `${prefix}.${sourceKey}.${instKey}`
            for (const ref of collectSources(instSubtree, path, filter)) {
              add(out, ref, pgn, inst)
            }
          }
        }
      }
    }
  }

  if (filter) {
    for (const [ref, { rules }] of filter) {
      for (const rule of rules) {
        const pgns = TRACKED_PGNS_BY_GROUP.get(rule.group)
        if (!pgns || pgns.length === 0) continue
        if (!collectSources(getAt(selfTree, rule.target)).has(ref)) continue
        for (const pgn of pgns) add(out, ref, pgn, rule.instance)
      }
    }
  }

  return materialise(out, (a, b) => a - b)
}

function isTreeNode(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null
}

// Sources publishing anywhere in the subtree. With `mapped`, `path` is the
// subtree's path and leaves its sources' rules moved away are skipped.
function collectSources(
  node: unknown,
  path?: string,
  mapped?: MappedSources
): Set<string> {
  const out = new Set<string>()
  visit(node, out, path, mapped)
  return out
}

function visit(
  node: unknown,
  out: Set<string>,
  path: string | undefined,
  mapped: MappedSources | undefined
): void {
  if (!isTreeNode(node)) return
  const include = (ref: string) => {
    if (path === undefined || !isMovedLeaf(mapped, ref, path)) out.add(ref)
  }
  if (typeof node.$source === 'string') include(node.$source)
  const values = node.values
  if (isTreeNode(values)) {
    for (const ref of Object.keys(values)) include(ref)
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'meta' || k === 'value' || k === 'values' || k === 'timestamp')
      continue
    if (k === '$source' || k === 'pgn' || k === 'sentence') continue
    visit(v, out, path === undefined ? undefined : `${path}.${k}`, mapped)
  }
}

const SOURCE_KEY_PATHS: ReadonlyArray<[string, PgnTreePath]> = Object.entries(
  PGN_TREE_PATHS
).flatMap(([pgn, paths]) =>
  paths
    .filter(({ shape }) => shape === 'source-inst')
    .map((p): [string, PgnTreePath] => [pgn, p])
)

/**
 * Build sourceRef → pgn → list of compound keys for temperature/humidity
 * PGNs whose unique key includes the source-type enum.
 *
 * The n2k-signalk mapping for PGN 130312/130316 routes each source-type
 * (Outside, Inside, Main Cabin, Freezer, …) to a different SK path,
 * usually flat — `environment.outside.temperature`,
 * `environment.inside.mainCabin.temperature`, etc. The numeric instance
 * is generally not part of the path either (only Live/Bait Well and
 * Exhaust Gas use pathWithIndex). Two devices "share" a 130312 stream
 * only when they publish the same SK leaf path; the path already
 * encodes the (instance, source-type) tuple uniquely. Use the relative
 * SK path as the compound key.
 */
export function buildPgnSourceKeysFromTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selfTree: any,
  mapped?: MappedSources
): Record<string, Record<string, string[]>> {
  const out: Accumulator<string> = {}
  if (!selfTree || typeof selfTree !== 'object') return {}
  const filter = hasMappings(mapped) ? mapped : undefined

  for (const [pgn, { prefix }] of SOURCE_KEY_PATHS) {
    forEachLeaf(getAt(selfTree, prefix), prefix, (leaf, path) => {
      for (const ref of collectSources(leaf)) {
        if (!isMovedLeaf(filter, ref, path)) add(out, ref, pgn, path)
      }
    })
  }

  if (filter) {
    for (const [ref, { rules, src }] of filter) {
      for (const rule of rules) {
        const [defaultPrefix] = defaultPrefixes(
          rule.group,
          rule.discriminator,
          rule.instance,
          src
        )
        if (defaultPrefix === undefined) continue
        const covering = SOURCE_KEY_PATHS.filter(([, { prefix }]) =>
          isAtOrUnder(defaultPrefix, prefix)
        )
        if (covering.length === 0) continue
        forEachLeaf(getAt(selfTree, rule.target), rule.target, (leaf, path) => {
          if (!collectSources(leaf).has(ref)) return
          const key = defaultPrefix + path.slice(rule.target.length)
          for (const [pgn] of covering) add(out, ref, pgn, key)
        })
      }
    }
  }

  return materialise(out)
}

// Every leaf that carries data in the subtree, with its full SK path.
function forEachLeaf(
  node: unknown,
  path: string,
  onLeaf: (leaf: Record<string, unknown>, path: string) => void
): void {
  if (!isTreeNode(node)) return
  const isLeaf =
    Object.prototype.hasOwnProperty.call(node, 'value') ||
    Object.prototype.hasOwnProperty.call(node, 'values') ||
    typeof node.$source === 'string'
  if (isLeaf) {
    onLeaf(node, path)
    return
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'meta' || k === 'timestamp') continue
    forEachLeaf(v, `${path}.${k}`, onLeaf)
  }
}

// PGNs whose instance is qualified by a temperature or humidity source.
const DATA_INSTANCE_PGNS = new Set<number>()

for (const def of getAllPGNs()) {
  const hasInstanceKey = def.Fields.some(
    (f) => f.Id === 'instance' && f.PartOfPrimaryKey
  )
  if (!hasInstanceKey) continue

  const hasSourceKey = def.Fields.some(
    (f) =>
      f.Id === 'source' &&
      f.PartOfPrimaryKey &&
      (f.LookupEnumeration === 'TEMPERATURE_SOURCE' ||
        f.LookupEnumeration === 'HUMIDITY_SOURCE')
  )
  if (hasSourceKey) DATA_INSTANCE_PGNS.add(def.PGN)
}

const HUMIDITY_PGN = 130313

/**
 * One data instance a device publishes, as the NMEA Discovery page lists it.
 * `group`, `discriminator` and `editor` are present for PGNs whose instances
 * can be mapped to other Signal K paths.
 */
export interface DiscoveredInstance {
  pgn: number
  instance: number
  sourceLabel: string
  sourceEnum?: number
  label?: string
  hardwareChannelId?: number
  group?: N2kInstanceGroupId
  discriminator?: number
  editor?: TargetEditor
}

function sensorSource(
  pgn: number,
  fields: Record<string, unknown>
): { sourceLabel: string; sourceEnum?: number } {
  const [enumName, fallback] =
    pgn === HUMIDITY_PGN
      ? ['HUMIDITY_SOURCE', 'Humidity Source']
      : ['TEMPERATURE_SOURCE', 'Temperature Source']
  const srcField = fields.source ?? fields.Source
  if (typeof srcField === 'string') {
    return {
      sourceLabel: srcField,
      sourceEnum: getEnumerationValue(enumName, srcField)
    }
  }
  if (typeof srcField === 'number') {
    return {
      sourceLabel:
        getEnumerationName(enumName, srcField) || `${fallback} ${srcField}`,
      sourceEnum: srcField
    }
  }
  return { sourceLabel: '' }
}

/**
 * Describe a decoded frame as a discovered data instance: the temperature and
 * humidity PGNs, and every PGN of the instance group table. Undefined for any
 * other frame.
 */
export function discoveredInstance(
  frame: N2kFrame
): DiscoveredInstance | undefined {
  const pgn = Number(frame.pgn)
  const fields = frame.fields
  if (!fields) return undefined
  const classification = classifyInstance(frame)

  let entry: DiscoveredInstance
  if (DATA_INSTANCE_PGNS.has(pgn)) {
    const instance = Number(fields.instance ?? fields.Instance)
    if (isNaN(instance)) return undefined
    entry = { pgn, instance, ...sensorSource(pgn, fields) }
  } else if (classification) {
    entry = { pgn, instance: classification.instance, sourceLabel: '' }
  } else {
    return undefined
  }

  if (classification) {
    entry.group = classification.group
    if (classification.discriminator !== undefined) {
      entry.discriminator = classification.discriminator
    }
    entry.editor = targetEditor(
      classification.group,
      classification.discriminator,
      classification.instance,
      Number(frame.src)
    )
  }
  return entry
}
