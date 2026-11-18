import { mkdir } from 'fs/promises'
import { readFileSync, unlinkSync } from 'fs'
import { uptime } from 'os'
import { join } from 'path'
import { performance } from 'perf_hooks'
import { Delta, FullSignalK } from '@signalk/server-api'
import { atomicWriteFile } from './atomicWrite'
import { createDebug } from './debug'
import type DeltaCache from './deltacache'
import { SERVERSTATEDIRNAME } from './serverstate/store'
import { ContextMatcher } from './types'

const debug = createDebug('signalk-server:deltacache-persistence')

const FILE_NAME = 'deltacache.json'
const DEFAULT_PRUNE_CONTEXTS_MINUTES = 60
const DEFAULT_RESTORE_MAX_AGE_MINUTES = 60
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
// Linux gives every boot a random id; elsewhere it is missing and every
// start is treated as a reboot.
const BOOT_ID_PATH = '/proc/sys/kernel/random/boot_id'
const CLOCK_CHECK_INTERVAL_MS = MS_PER_MINUTE
// Smaller differences between the wall clock and the monotonic clock are
// drift and slewing, not the clock being set.
const CLOCK_STEP_THRESHOLD_MS = MS_PER_MINUTE
// Base data is reloaded from baseDeltas.json on every start; saving it here
// could bring back a field the user has since cleared.
const BASE_DATA_SOURCE = 'defaults'
// An alarm is an event rather than a measurement, and a restored one would
// lack the state the notification manager keeps for clearing it.
const NOTIFICATIONS_PATH_PREFIX = 'notifications.'

export interface DeltaCachePersistenceApp {
  config: {
    configPath: string
    settings: {
      restoreOwnData?: boolean
      restoreOtherVessels?: boolean
      restoreMaxAgeMinutes?: number
      pruneContextsMinutes?: number
    }
  }
  selfContext: string
  deltaCache: DeltaCache
  signalk: Pick<FullSignalK, 'restoreDelta'>
}

/**
 * Wall-clock time can't be trusted at boot: a computer without a
 * real-time clock starts from the last time it saved, so even months off
 * look like moments. Uptime and the boot id are not affected by the clock.
 */
interface SavedDeltaCache {
  savedAt: number
  bootId?: string
  uptimeSeconds: number
  deltas: Delta[]
}

/** When a restore happened, to work out the real downtime once the clock is set. */
export interface RestoreClock {
  savedAt: number
  restoredAt: number
  restoredAtMonotonic: number
}

export interface StopOptions {
  /** Save the cached values for the next start. */
  saveCachedValues?: boolean
}

export function deltaCacheFilePath(configPath: string): string {
  return join(configPath, SERVERSTATEDIRNAME, FILE_NAME)
}

function readBootId(): string | undefined {
  try {
    return readFileSync(BOOT_ID_PATH, 'utf-8').trim() || undefined
  } catch {
    return undefined
  }
}

function isSavedDeltaCache(data: unknown): data is SavedDeltaCache {
  const saved = data as SavedDeltaCache
  return (
    typeof saved?.savedAt === 'number' &&
    typeof saved.uptimeSeconds === 'number' &&
    Array.isArray(saved.deltas)
  )
}

function isWorthSaving(delta: Delta): boolean {
  const update = delta.updates[0]
  if (!update || update.$source === BASE_DATA_SOURCE) {
    return false
  }
  return !(
    'values' in update &&
    update.values.some((pv) => pv.path.startsWith(NOTIFICATIONS_PATH_PREFIX))
  )
}

/**
 * Save the cached values on a clean stop so that the next start can
 * restore them.
 */
export async function saveDeltaCache(
  app: DeltaCachePersistenceApp
): Promise<void> {
  const { restoreOwnData, restoreOtherVessels } = app.config.settings
  if (!restoreOwnData) {
    return
  }
  const matcher: ContextMatcher = restoreOtherVessels
    ? () => true
    : ({ context }) => context === app.selfContext
  const deltas = app.deltaCache
    .getCachedDeltas(matcher, undefined, undefined, 'all', true)
    .filter(isWorthSaving)
  const filePath = deltaCacheFilePath(app.config.configPath)
  await mkdir(join(app.config.configPath, SERVERSTATEDIRNAME), {
    recursive: true
  })
  const saved: SavedDeltaCache = {
    savedAt: Date.now(),
    bootId: readBootId(),
    uptimeSeconds: uptime(),
    deltas
  }
  await atomicWriteFile(filePath, JSON.stringify(saved))
  debug('Saved %d cached values to %s', deltas.length, filePath)
}

/**
 * Restore values saved by the previous clean stop, unless the server was
 * off for longer than the maximum age. The file is removed as soon as it
 * is read: after a power cut no new file is written, and a file left
 * behind would bring back the values of an older run.
 *
 * Within the same boot the downtime is exact, from uptime. After a reboot
 * it comes from the wall clock, and is checked again when the clock is
 * set later, by NTP or a GNSS time source.
 */
export function restoreDeltaCache(app: DeltaCachePersistenceApp): void {
  const filePath = deltaCacheFilePath(app.config.configPath)
  let data: string
  try {
    data = readFileSync(filePath, 'utf-8')
    unlinkSync(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Unable to read ${filePath}: ${(err as Error).message}`)
    }
    return
  }

  const {
    restoreOwnData,
    restoreOtherVessels,
    restoreMaxAgeMinutes,
    pruneContextsMinutes
  } = app.config.settings
  if (!restoreOwnData) {
    return
  }

  let saved: unknown
  try {
    saved = JSON.parse(data)
  } catch (err) {
    console.error(`Unable to parse ${filePath}: ${(err as Error).message}`)
    return
  }
  if (!isSavedDeltaCache(saved)) {
    return
  }

  const now = Date.now()
  const maxAgeMs =
    (restoreMaxAgeMinutes || DEFAULT_RESTORE_MAX_AGE_MINUTES) * MS_PER_MINUTE
  const bootId = readBootId()
  const sameBoot = bootId !== undefined && bootId === saved.bootId
  const downtimeMs = sameBoot
    ? (uptime() - saved.uptimeSeconds) * MS_PER_SECOND
    : now - saved.savedAt
  if (downtimeMs > maxAgeMs) {
    debug(
      'Not restoring values saved %d minutes ago',
      downtimeMs / MS_PER_MINUTE
    )
    return
  }

  const { deltas } = saved
  const oldestOtherVesselMs =
    now -
    (pruneContextsMinutes || DEFAULT_PRUNE_CONTEXTS_MINUTES) * MS_PER_MINUTE
  for (const delta of deltas as Delta[]) {
    if (typeof delta?.context !== 'string') {
      continue
    }
    const isSelf = delta.context === app.selfContext
    if (!isSelf && !restoreOtherVessels) {
      continue
    }
    const timestampMs = Date.parse(delta?.updates?.[0]?.timestamp ?? '')
    if (!Number.isFinite(timestampMs)) {
      continue
    }
    if (!isSelf && timestampMs < oldestOtherVesselMs) {
      continue
    }
    // Other vessels age out by their last real update, so a restored AIS
    // target is pruned as if the server had never stopped. A timestamp in
    // the future is capped so that it cannot keep a target forever.
    const lastModified = isSelf ? now : Math.min(timestampMs, now)
    if (app.deltaCache.restoreDelta(delta, lastModified)) {
      app.signalk.restoreDelta(delta, lastModified)
    }
  }
  debug('Restored %d cached values', deltas.length)

  if (sameBoot) {
    app.deltaCache.forgetRestoredValues()
    return
  }
  const clock: RestoreClock = {
    savedAt: saved.savedAt,
    restoredAt: now,
    restoredAtMonotonic: performance.now()
  }
  const timer = setInterval(() => {
    if (checkRestoreClock(app, clock)) {
      clearInterval(timer)
    }
  }, CLOCK_CHECK_INTERVAL_MS)
  timer.unref()
}

/**
 * Once the wall clock has been set, the real time of the restore is known.
 * If the server was off for longer than the maximum age after all, the
 * restored values that live data has not replaced are dropped. Returns
 * whether the check is done.
 */
export function checkRestoreClock(
  app: DeltaCachePersistenceApp,
  clock: RestoreClock,
  wallNow = Date.now(),
  monotonicNow = performance.now()
): boolean {
  const sinceRestoreMs = monotonicNow - clock.restoredAtMonotonic
  const clockStepMs = wallNow - clock.restoredAt - sinceRestoreMs
  if (Math.abs(clockStepMs) < CLOCK_STEP_THRESHOLD_MS) {
    return false
  }
  const maxAgeMs =
    (app.config.settings.restoreMaxAgeMinutes ||
      DEFAULT_RESTORE_MAX_AGE_MINUTES) * MS_PER_MINUTE
  const downtimeMs = wallNow - sinceRestoreMs - clock.savedAt
  if (downtimeMs > maxAgeMs) {
    debug('Clock was set, dropping values restored after a long downtime')
    app.deltaCache.dropRestoredValues()
  } else {
    app.deltaCache.forgetRestoredValues()
  }
  return true
}
