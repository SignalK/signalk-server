/*
 * Persistence of source-priority state in its own file, `priorities.json`,
 * alongside `settings.json`.
 *
 * Why separate: priority configuration is user-accumulated state that grows
 * with every source seen on the bus. When it drifts into an inconsistent
 * shape (wrong refs after a transport swap, outdated aliases, bad groups)
 * users want a way to reset it without touching the rest of the server
 * configuration. Keeping it in its own file makes the recovery path as
 * simple as deleting one file.
 *
 * The In-Memory representation under `app.config.settings.*` is unchanged —
 * callers keep reading and writing the same keys. Only the file I/O
 * boundary is split.
 */

import fs from 'fs'
import path from 'path'
import { atomicWriteFile } from '../atomicWrite'
import { createDebug } from '../debug'

const debug = createDebug('signalk-server:priorities-file')

const PRIORITIES_FILE = 'priorities.json'

export const PRIORITIES_KEYS = [
  'sourcePriorities',
  'priorityGroups',
  'priorityDefaults',
  'sourcePriorityOverrides',
  'sourceAliases',
  'ignoredInstanceConflicts'
] as const

export type PrioritiesKey = (typeof PRIORITIES_KEYS)[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Settings = Record<string, any>

interface MigrationApp {
  config: {
    configPath: string
    settings: Settings
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argv?: any
}

export function getPrioritiesFilePath(app: MigrationApp): string {
  return path.join(app.config.configPath, PRIORITIES_FILE)
}

function readPrioritiesFile(app: MigrationApp): Settings | undefined {
  const file = getPrioritiesFilePath(app)
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.error(
      `Error reading ${PRIORITIES_FILE} — ignoring. Delete the file to reset.`,
      e
    )
    return undefined
  }
}

/**
 * Merge stored priorities into in-memory settings. When a priorities.json
 * exists on disk, its values take precedence over whatever happened to be
 * in settings.json (because settings.json might still carry stale copies
 * left over from an older install). When it does not exist yet, leave
 * settings alone — the migration step below is responsible for creating
 * it.
 */
export function loadPrioritiesIntoSettings(app: MigrationApp): void {
  const stored = readPrioritiesFile(app)
  if (!stored) return
  for (const key of PRIORITIES_KEYS) {
    if (key in stored) {
      app.config.settings[key] = stored[key]
    }
  }
  debug('Loaded priorities from %s', PRIORITIES_FILE)
}

/**
 * One-shot migration from settings.json to priorities.json. Called at
 * server start after settings are loaded. If the separate file does not
 * exist yet but settings.json has any priority keys, copy them over and
 * strip them from settings. The caller is responsible for persisting the
 * stripped settings.json — we only mutate in-memory state and write the
 * new priorities.json.
 *
 * Returns true if settings.json changed and should be written out.
 */
export function migratePrioritiesIntoSeparateFile(app: MigrationApp): boolean {
  if (readPrioritiesFile(app)) return false
  const present: Settings = {}
  for (const key of PRIORITIES_KEYS) {
    if (key in app.config.settings) {
      present[key] = app.config.settings[key]
    }
  }
  if (Object.keys(present).length === 0) {
    return false
  }
  const file = getPrioritiesFilePath(app)
  try {
    fs.writeFileSync(file, JSON.stringify(present, null, 2))
  } catch (e) {
    console.error(`Failed to create ${PRIORITIES_FILE}:`, e)
    return false
  }
  for (const key of PRIORITIES_KEYS) {
    delete app.config.settings[key]
  }
  console.log(
    `Migrated priority state from settings.json to ${PRIORITIES_FILE}`
  )
  return true
}

/**
 * Extract the priority-related keys from a settings object, returning a
 * shallow copy of the remaining settings. Used by writeSettingsFile so
 * the on-disk settings.json never carries priority state.
 */
export function splitPrioritiesFromSettings(settings: Settings): {
  settingsWithoutPriorities: Settings
  priorities: Settings
} {
  const settingsWithoutPriorities: Settings = { ...settings }
  const priorities: Settings = {}
  for (const key of PRIORITIES_KEYS) {
    if (key in settingsWithoutPriorities) {
      priorities[key] = settingsWithoutPriorities[key]
      delete settingsWithoutPriorities[key]
    }
  }
  return { settingsWithoutPriorities, priorities }
}

export async function writePrioritiesFile(
  app: MigrationApp,
  priorities: Settings
): Promise<void> {
  const file = getPrioritiesFilePath(app)
  await atomicWriteFile(file, JSON.stringify(priorities, null, 2))
}

/**
 * Wipe priority state: remove the file and reset in-memory keys to
 * empty/undefined. After this call, the caller should also persist
 * settings.json (in case it still had priority keys — shouldn't, but
 * cheap to be safe).
 */
export async function resetPriorities(app: MigrationApp): Promise<void> {
  const file = getPrioritiesFilePath(app)
  try {
    await fs.promises.unlink(file)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to remove ${PRIORITIES_FILE}:`, e)
      throw e
    }
  }
  for (const key of PRIORITIES_KEYS) {
    delete app.config.settings[key]
  }
  console.log(`Priority state reset (${PRIORITIES_FILE} removed)`)
}
