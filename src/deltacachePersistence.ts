import { mkdir } from 'fs/promises'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { Delta, FullSignalK } from '@signalk/server-api'
import { atomicWriteFile } from './atomicWrite'
import { createDebug } from './debug'
import type DeltaCache from './deltacache'
import { SERVERSTATEDIRNAME } from './serverstate/store'
import { ContextMatcher } from './types'

const debug = createDebug('signalk-server:deltacache-persistence')

const FILE_NAME = 'deltacache.json'
const DEFAULT_PRUNE_CONTEXTS_MINUTES = 60
const MS_PER_MINUTE = 60 * 1000
// Base data is reloaded from baseDeltas.json on every start; saving it here
// could bring back a field the user has since cleared.
const BASE_DATA_SOURCE = 'defaults'

export interface DeltaCachePersistenceApp {
  config: {
    configPath: string
    settings: {
      restoreOwnData?: boolean
      restoreOtherVessels?: boolean
      pruneContextsMinutes?: number
    }
  }
  selfContext: string
  deltaCache: DeltaCache
  signalk: Pick<FullSignalK, 'restoreDelta'>
}

export function deltaCacheFilePath(configPath: string): string {
  return join(configPath, SERVERSTATEDIRNAME, FILE_NAME)
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
    .filter((delta) => delta.updates[0]?.$source !== BASE_DATA_SOURCE)
  const filePath = deltaCacheFilePath(app.config.configPath)
  await mkdir(join(app.config.configPath, SERVERSTATEDIRNAME), {
    recursive: true
  })
  await atomicWriteFile(filePath, JSON.stringify(deltas))
  debug('Saved %d cached values to %s', deltas.length, filePath)
}

/**
 * Restore values saved by the previous clean stop. The file is removed as
 * soon as it is read: after a power cut no new file is written, and a
 * file left behind would bring back the values of an older run.
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

  const { restoreOwnData, restoreOtherVessels, pruneContextsMinutes } =
    app.config.settings
  if (!restoreOwnData) {
    return
  }

  let deltas: unknown
  try {
    deltas = JSON.parse(data)
  } catch (err) {
    console.error(`Unable to parse ${filePath}: ${(err as Error).message}`)
    return
  }
  if (!Array.isArray(deltas)) {
    return
  }

  const now = Date.now()
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
    // target is pruned as if the server had never stopped.
    const lastModified = isSelf ? now : timestampMs
    app.deltaCache.restoreDelta(delta, lastModified)
    app.signalk.restoreDelta(delta, lastModified)
  }
  debug('Restored %d cached values', deltas.length)
}
