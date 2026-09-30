/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events'
import { Transform, TransformCallback } from 'stream'
import { N2kMapper } from '@signalk/n2k-signalk'
import {
  N2K_INSTANCE_GROUPS,
  N2K_INSTANCE_MAPPINGS_EVENT,
  defaultPrefixes,
  deviceKeyFromCanName,
  instanceRuleKey,
  isAtOrUnder,
  ruleShapeError,
  type N2kInstanceGroupId,
  type N2kInstanceMappings,
  type N2kInstanceRule
} from './n2k-instance-groups'
import type { CreateDebug, DebugLogger, DeltaCache } from './types'

// What n2k-signalk passes its instancePrefixResolver option.
interface InstancePrefixContext {
  group: N2kInstanceGroupId
  discriminator: number | undefined
  instance: number
  src: number | string
  canName: string | undefined
}

interface N2kFilter {
  source?: string
  pgn?: string
}

interface N2kToSignalKOptions {
  app: {
    selfContext: string
    isNmea2000OutAvailable: boolean
    deltaCache: DeltaCache
    config?: {
      settings?: {
        n2kInstanceMappings?: N2kInstanceMappings
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void
    emit(event: string, ...args: unknown[]): void
    handleMessage(id: string, delta: object): void
  }
  providerId: string
  filters?: N2kFilter[]
  filtersEnabled?: boolean
  useCanName?: boolean
  canNameWarmupMs?: number
  createDebug?: CreateDebug
  [key: string]: unknown
}

// When useCanName is on, a freshly seen NMEA 2000 device emits data frames
// before its ISO Address Claim (PGN 60928) resolves, so the very first
// deltas carry only the numeric src and no canName. Letting them through
// stamps a numeric-form ref that the canName form then supersedes a beat
// later, producing a transient duplicate device (the priority-reconcile
// skew #2739 chased). Instead we hold src-only deltas back for a warmup
// window, measured from the first frame seen, long enough for n2k-signalk's
// broadcast metadata request cycle (PGN 59904 → 60928) to settle the canName
// for devices that claim. After the window we let src-only deltas through
// unchanged, so a controller/app node that never claims a canName (e.g.
// Maretron N2KView, which re-broadcasts alarms but answers no ISO request
// for its own address) still reports under its numeric ref.
const CANNAME_WARMUP_MS = 10000

// An alarm the device stops repeating for this long returns to normal; the
// check runs at the second interval.
const AUTO_NORMAL_QUIET_MS = 10000
const AUTO_NORMAL_CHECK_MS = 5000

interface N2kMessage {
  src: string | number
  pgn: string | number
  timestamp: string
  fields?: Record<string, unknown>
}

interface DeltaSource {
  label: string
  type: string
  pgn: number
  src: string
  canName?: string
}

interface DeltaValue {
  // null or absent when n2k-signalk cannot place the value
  path?: string | null
  value: { state: string; [key: string]: unknown }
}

interface DeltaUpdate {
  source: DeltaSource
  timestamp?: string
  values: DeltaValue[]
}

interface Delta {
  context: string
  updates: DeltaUpdate[]
}

interface SourceMeta {
  [key: string]: unknown
}

interface NotificationEntry {
  lastTime: number
  interval: ReturnType<typeof setInterval>
  readonly context: string
  readonly source: DeltaSource
  readonly value: DeltaValue
}

function normalDelta(entry: NotificationEntry): Delta {
  const copy = structuredClone(entry.value)
  copy.value.state = 'normal'
  return {
    context: entry.context,
    updates: [{ source: entry.source, values: [copy] }]
  }
}

const NOTIFICATIONS = 'notifications.'

const INSTANCE_PGNS: ReadonlySet<number> = new Set(
  N2K_INSTANCE_GROUPS.flatMap((group) => group.pgns)
)

interface DeviceRules {
  readonly rules: readonly N2kInstanceRule[]
  readonly targets: ReadonlyMap<string, string>
}

// settings.json is hand-editable, so rules are checked for shape here; the
// server's rule routes do the full validation.
function isWellFormedRule(value: unknown): value is N2kInstanceRule {
  return ruleShapeError(value) === undefined
}

function compileRules(
  mappings: unknown,
  debug: DebugLogger
): Map<string, DeviceRules> {
  const compiled = new Map<string, DeviceRules>()
  if (typeof mappings !== 'object' || mappings === null) return compiled
  let skipped = 0
  for (const [deviceKey, entries] of Object.entries(mappings)) {
    if (!Array.isArray(entries)) {
      skipped++
      continue
    }
    const rules = entries.filter(isWellFormedRule)
    skipped += entries.length - rules.length
    if (rules.length === 0) continue
    const targets = new Map<string, string>()
    for (const rule of rules) {
      targets.set(
        instanceRuleKey(rule.group, rule.discriminator, rule.instance),
        rule.target
      )
    }
    compiled.set(deviceKey, { rules, targets })
  }
  if (skipped > 0 && debug.enabled) {
    debug(`skipped ${skipped} malformed n2kInstanceMappings entries`)
  }
  return compiled
}

// A rule whose target moved, or that was added or removed: the paths its
// instance may have been written under before the change.
interface MovedRule {
  readonly rule: N2kInstanceRule
  readonly previousTarget: string | undefined
}

function movedRules(
  before: Map<string, DeviceRules>,
  after: Map<string, DeviceRules>
): Map<string, MovedRule[]> {
  const moved = new Map<string, MovedRule[]>()
  for (const deviceKey of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(deviceKey)
    const next = after.get(deviceKey)
    const changes: MovedRule[] = []
    // A target another rule of the device still writes is not vacated.
    const nextTargets = new Set(next?.targets.values())
    for (const rule of old?.rules ?? []) {
      const key = instanceRuleKey(rule.group, rule.discriminator, rule.instance)
      if (next?.targets.get(key) !== rule.target) {
        changes.push({
          rule,
          previousTarget: nextTargets.has(rule.target) ? undefined : rule.target
        })
      }
    }
    for (const rule of next?.rules ?? []) {
      const key = instanceRuleKey(rule.group, rule.discriminator, rule.instance)
      if (!old?.targets.has(key)) {
        changes.push({ rule, previousTarget: undefined })
      }
    }
    if (changes.length > 0) moved.set(deviceKey, changes)
  }
  return moved
}

export default class N2kToSignalK extends Transform {
  private readonly sourceMeta: Record<number, SourceMeta> = {}
  private readonly notifications: Record<
    string,
    Record<number, NotificationEntry>
  > = {}
  private readonly options: N2kToSignalKOptions
  private readonly app: N2kToSignalKOptions['app']
  private readonly filters?: N2kFilter[]
  private readonly n2kMapper: N2kMapper & EventEmitter
  // The mapper keeps this object as its options and reads
  // instancePrefixResolver from it on every frame.
  private readonly mapperOptions: Record<string, unknown>
  private readonly canNameWarmupMs: number
  private readonly debug: DebugLogger
  // Set on the first frame; src-only deltas are held back until this time
  // to give the canName time to resolve. Undefined until traffic starts.
  private warmupUntil?: number
  private instanceRules: Map<string, DeviceRules>
  private hasInstanceRules: boolean
  // Device key per bus address, known once the address claim resolves.
  private readonly deviceKeys = new Map<number, string>()
  // While rules exist, frames of instance PGNs from an address without a
  // device key are held back until this time, set on its first such frame.
  private readonly sourceWarmupUntil = new Map<number, number>()

  constructor(options: N2kToSignalKOptions) {
    super({ objectMode: true })
    this.options = options
    this.canNameWarmupMs = options.canNameWarmupMs ?? CANNAME_WARMUP_MS
    this.app = options.app
    const createDebug: CreateDebug = options.createDebug ?? require('debug')
    this.debug = createDebug('signalk:streams:n2k-signalk')
    this.instanceRules = compileRules(
      this.app.config?.settings?.n2kInstanceMappings,
      this.debug
    )
    this.hasInstanceRules = this.instanceRules.size > 0
    this.app.on('serverAdminEvent', (event: { type?: unknown } | undefined) => {
      if (event?.type === N2K_INSTANCE_MAPPINGS_EVENT) {
        this.reloadInstanceRules()
      }
    })

    if (options.filters && options.filtersEnabled) {
      this.filters = options.filters.filter(
        (f) => (f.source && f.source.length) || (f.pgn && f.pgn.length)
      )
    }

    this.mapperOptions = { ...options, sendMetaData: true }
    this.setInstancePrefixResolver()
    this.n2kMapper = new N2kMapper(this.mapperOptions) as N2kMapper &
      EventEmitter

    const n2kOutEvent = 'nmea2000JsonOut'

    this.n2kMapper.on('n2kOut', (pgn: object) =>
      this.app.emit('nmea2000JsonOut', pgn)
    )

    this.n2kMapper.on(
      'n2kSourceMetadata',
      (n2k: N2kMessage, meta: Record<string, unknown>) => {
        const src = Number(n2k.src)
        // Reject the null address (254) — see _transform for the reasoning.
        // Address Claim (PGN 60928) from an unclaimed device arrives with
        // src=254; the claim itself updates the internal canboatjs mapping
        // but we don't want to surface a "254" identity in the server tree.
        if (src === 254) return
        const existing = this.sourceMeta[src] ?? {}
        const prevCanName =
          typeof existing.canName === 'string' ? existing.canName : undefined
        const newCanName =
          typeof meta.canName === 'string'
            ? (meta.canName as string)
            : undefined
        this.sourceMeta[src] = { ...existing, ...meta }
        if (newCanName) {
          const deviceKey = deviceKeyFromCanName(newCanName)
          if (deviceKey !== undefined) {
            this.deviceKeys.set(src, deviceKey)
            if (newCanName !== prevCanName) {
              this.pruneUnmappedPaths(src, deviceKey)
            }
          }
        }
        // When a CAN Name resolves for the first time (or replaces a
        // previously stamped "unknown") and useCanName is active, deltas
        // that have already flowed as "<providerId>.<src>" need to
        // migrate to "<providerId>.<canName>". Without this, persisted
        // sourcePriorities / sourceAliases / priorityGroups stay bound
        // to the address form, and the data-browser carries two rows
        // per device until restart.
        if (
          this.options.useCanName &&
          newCanName &&
          newCanName !== prevCanName
        ) {
          // n2k.src is a bus address (0–253) and newCanName is a 16-hex
          // string, so the two refs always differ when we reach here.
          const oldRef = `${this.options.providerId}.${n2k.src}`
          const newRef = `${this.options.providerId}.${newCanName}`
          this.app.emit('sourceRefChanged', { oldRef, newRef, src })
        }
        const delta = {
          context: this.app.selfContext,
          updates: [
            {
              source: {
                ...this.sourceMeta[src],
                label: this.options.providerId,
                type: 'NMEA2000',
                pgn: Number(n2k.pgn),
                src: n2k.src.toString()
              },
              timestamp:
                n2k.timestamp.substring(0, 10) +
                'T' +
                n2k.timestamp.substring(11, n2k.timestamp.length),
              values: []
            }
          ]
        }
        this.app.deltaCache.setSourceDelta(
          `${this.options.providerId}.${n2k.src}`,
          delta
        )
      }
    )

    this.n2kMapper.on(
      'n2kSourceMetadataTimeout',
      (pgn: string | number, src: string | number) => {
        if (Number(pgn) === 60928) {
          console.warn(`n2k-signalk: unable to detect can name for src ${src}`)
        }
      }
    )

    this.n2kMapper.on(
      'n2kSourceChanged',
      (src: string | number, from: string, to: string) => {
        console.warn(`n2k-signalk: address ${src} changed from ${from} ${to}`)
        const srcNum = Number(src)
        if (this.sourceMeta[srcNum]) {
          delete this.sourceMeta[srcNum]
        }
        this.deviceKeys.delete(srcNum)
        this.sourceWarmupUntil.delete(srcNum)
        // Notify server so persistent settings can be migrated
        const oldRef = `${this.options.providerId}.${from}`
        const newRef = `${this.options.providerId}.${to}`
        this.app.emit('sourceRefChanged', { oldRef, newRef, src: srcNum })
      }
    )

    if (this.app.isNmea2000OutAvailable) {
      this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
    } else {
      this.app.on('nmea2000OutAvailable', () =>
        this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
      )
    }
  }

  private reloadInstanceRules(): void {
    const previous = this.instanceRules
    this.instanceRules = compileRules(
      this.app.config?.settings?.n2kInstanceMappings,
      this.debug
    )
    this.hasInstanceRules = this.instanceRules.size > 0
    this.setInstancePrefixResolver()
    // Without identity these addresses could not be held back while there
    // were no rules, so their frames already landed at the default paths.
    // An expired window gets those paths pruned once the identity resolves.
    for (const key of Object.keys(this.sourceMeta)) {
      const src = Number(key)
      if (!this.deviceKeys.has(src) && !this.sourceWarmupUntil.has(src)) {
        this.sourceWarmupUntil.set(src, 0)
      }
    }
    this.settleMovedNotifications(movedRules(previous, this.instanceRules))
  }

  // Without rules the mapper gets no resolver, so it builds its default
  // paths at the same cost as without this feature.
  private setInstancePrefixResolver(): void {
    this.mapperOptions.instancePrefixResolver = this.hasInstanceRules
      ? this.resolveInstancePrefix
      : undefined
  }

  // Reads the rules at call time, so a reload applies to the next frame.
  // The device key comes from the address's resolved identity, as the
  // hold-back does, so frames of an unidentified address keep their
  // default paths.
  private readonly resolveInstancePrefix = (
    context: InstancePrefixContext
  ): string | undefined => {
    const deviceKey = this.deviceKeys.get(Number(context.src))
    if (deviceKey === undefined) return undefined
    return this.instanceRules
      .get(deviceKey)
      ?.targets.get(
        instanceRuleKey(context.group, context.discriminator, context.instance)
      )
  }

  private settleMovedNotifications(moved: Map<string, MovedRule[]>): void {
    if (moved.size === 0) return
    for (const [src, deviceKey] of this.deviceKeys) {
      const changes = moved.get(deviceKey)
      if (!changes) continue
      const prefixes: string[] = []
      for (const { rule, previousTarget } of changes) {
        if (previousTarget !== undefined) prefixes.push(previousTarget)
        prefixes.push(
          ...defaultPrefixes(rule.group, rule.discriminator, rule.instance, src)
        )
      }
      this.settleNotifications(src, prefixes)
    }
  }

  // Emits now the normal a pending auto-normal under one of the prefixes
  // would emit later, and drops its tracker: the leaf is about to move or
  // be pruned, and a later auto-normal would recreate it at the old path.
  private settleNotifications(src: number, prefixes: readonly string[]): void {
    for (const [path, pathNotifs] of Object.entries(this.notifications)) {
      const entry = pathNotifs[src]
      if (
        !entry ||
        !prefixes.some(
          (p) => isAtOrUnder(path, p) || isAtOrUnder(path, NOTIFICATIONS + p)
        )
      ) {
        continue
      }
      clearInterval(entry.interval)
      delete pathNotifs[src]
      this.app.handleMessage(this.options.providerId, normalDelta(entry))
    }
  }

  // Frames from this address passed at the default paths before its
  // identity resolved; drop those leaves now that rules move them. An
  // instance without a rule that shares a default rewrites it on its next
  // frame.
  private pruneUnmappedPaths(src: number, deviceKey: string): void {
    const deviceRules = this.instanceRules.get(deviceKey)
    const warmupUntil = this.sourceWarmupUntil.get(src)
    if (!deviceRules || warmupUntil === undefined || Date.now() < warmupUntil) {
      return
    }
    const defaults: string[] = []
    for (const rule of deviceRules.rules) {
      defaults.push(
        ...defaultPrefixes(rule.group, rule.discriminator, rule.instance, src)
      )
    }
    if (defaults.length === 0) return
    this.settleNotifications(src, defaults)
    const prefixes: string[] = []
    for (const prefix of defaults) prefixes.push(prefix, NOTIFICATIONS + prefix)
    // Deltas without identity carry the address form of the source ref,
    // whether or not useCanName is on.
    this.app.deltaCache.removeSource?.(
      `${this.options.providerId}.${src}`,
      prefixes
    )
  }

  private inSourceWarmup(src: number): boolean {
    const now = Date.now()
    let until = this.sourceWarmupUntil.get(src)
    if (until === undefined) {
      until = now + this.canNameWarmupMs
      this.sourceWarmupUntil.set(src, until)
    }
    return now < until
  }

  private isFiltered(source: DeltaSource): N2kFilter | undefined {
    if (!this.filters) {
      return undefined
    }
    return this.filters.find((filter) => {
      const sFilter = this.options.useCanName ? source.canName : source.src
      return (
        (!filter.source ||
          filter.source.length === 0 ||
          filter.source === sFilter) &&
        (!filter.pgn ||
          filter.pgn.length === 0 ||
          String(filter.pgn) === String(source.pgn))
      )
    })
  }

  _transform(
    chunk: N2kMessage,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    try {
      // NMEA 2000 reserves address 254 as the "null address" — a device
      // sends with 254 before it has claimed its real address via PGN
      // 60928. Frames carrying 254 therefore have no stable identity;
      // passing them on as deltas creates phantom "can0.254" rows in the
      // Data Browser, priority groups, and NMEA Discovery. Drop them.
      if (Number(chunk.src) === 254) {
        done()
        return
      }

      if (this.warmupUntil === undefined) {
        this.warmupUntil = Date.now() + this.canNameWarmupMs
      }

      const delta = this.n2kMapper.toDelta(chunk) as unknown as
        Delta | undefined

      const src = Number(chunk.src)
      if (!this.sourceMeta[src]) {
        this.sourceMeta[src] = {}
      }

      const firstUpdate = delta?.updates[0]
      if (
        delta &&
        firstUpdate &&
        firstUpdate.values.length > 0 &&
        !this.isFiltered(firstUpdate.source)
      ) {
        if (!this.options.useCanName) {
          delete firstUpdate.source.canName
        }

        if (this.hasInstanceRules && INSTANCE_PGNS.has(Number(chunk.pgn))) {
          const deviceKey = this.deviceKeys.get(src)
          if (deviceKey === undefined && this.inSourceWarmup(src)) {
            done()
            return
          }
        }

        const canName = firstUpdate.source.canName

        // Hold src-only deltas back only during the warmup window, so the
        // canName has a chance to resolve before any numeric-form ref is
        // stamped. Once the window passes, a device that still has no
        // canName (slow or never-claiming) reports under its numeric ref.
        if (
          this.options.useCanName &&
          !canName &&
          Date.now() < this.warmupUntil!
        ) {
          done()
          return
        }

        delta.updates.forEach((update) => {
          update.values.forEach((kv) => {
            if (kv.path && kv.path.startsWith('notifications.')) {
              const pathNotifs = this.notifications[kv.path]
              if (
                kv.value.state === 'normal' &&
                pathNotifs &&
                pathNotifs[src]
              ) {
                clearInterval(pathNotifs[src].interval)
                delete pathNotifs[src]
              } else if (kv.value.state !== 'normal') {
                if (!this.notifications[kv.path]) {
                  this.notifications[kv.path] = {}
                }
                const currentPathNotifs = this.notifications[kv.path]!
                if (!currentPathNotifs[src]) {
                  const entry: NotificationEntry = {
                    lastTime: Date.now(),
                    interval: setInterval(() => {
                      if (
                        currentPathNotifs[src] === entry &&
                        Date.now() - entry.lastTime > AUTO_NORMAL_QUIET_MS
                      ) {
                        delete currentPathNotifs[src]
                        clearInterval(entry.interval)
                        this.app.handleMessage(
                          this.options.providerId,
                          normalDelta(entry)
                        )
                      }
                    }, AUTO_NORMAL_CHECK_MS),
                    context: delta.context,
                    source: update.source,
                    value: kv
                  }
                  currentPathNotifs[src] = entry
                } else {
                  currentPathNotifs[src].lastTime = Date.now()
                }
              }
            }
          })
        })
        this.push(delta)
      }
    } catch (ex) {
      console.error(ex)
    }
    done()
  }
}
