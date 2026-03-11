import { SourceRef } from '@signalk/server-api'
import { writeSettingsFile } from './config/config'
import { createDebug } from './debug'
import * as fs from 'fs'
import * as path from 'path'

const debug = createDebug('signalk-server:sourceref-migration')

const LABELS_FILENAME = 'n2k-channel-labels.json'

interface MigrationApp {
  config: {
    configPath: string
    settings: {
      sourceRanking?: Array<{ sourceRef: string; timeout: number }>
      sourcePriorities?: Record<
        string,
        Array<{ sourceRef: string; timeout: number }>
      >
      sourceAliases?: Record<string, string>
      ignoredInstanceConflicts?: Record<string, string>
    }
  }
  activateSourcePriorities: () => void
  deltaCache: {
    removeSource(sourceRef: SourceRef): void
  }
  emit(event: string, ...args: unknown[]): boolean
}

export function migrateSourceRef(
  app: MigrationApp,
  oldRef: string,
  newRef: string
): void {
  const settings = app.config.settings
  let settingsChanged = false
  const migrated: string[] = []

  // 1. sourceRanking
  if (settings.sourceRanking) {
    for (const entry of settings.sourceRanking) {
      if (entry.sourceRef === oldRef) {
        entry.sourceRef = newRef
        settingsChanged = true
        migrated.push('sourceRanking')
        break
      }
    }
  }

  // 2. sourcePriorities (path-level)
  if (settings.sourcePriorities) {
    for (const entries of Object.values(settings.sourcePriorities)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        if (entry.sourceRef === oldRef) {
          entry.sourceRef = newRef
          settingsChanged = true
          if (!migrated.includes('sourcePriorities')) {
            migrated.push('sourcePriorities')
          }
        }
      }
    }
  }

  // 3. sourceAliases
  if (settings.sourceAliases && oldRef in settings.sourceAliases) {
    const alias = settings.sourceAliases[oldRef]
    delete settings.sourceAliases[oldRef]
    settings.sourceAliases[newRef] = alias
    settingsChanged = true
    migrated.push('sourceAliases')
  }

  // 4. ignoredInstanceConflicts (keys are "refA+refB" sorted pairs)
  if (settings.ignoredInstanceConflicts) {
    const updates: Array<{ oldKey: string; newKey: string; value: string }> = []
    for (const [key, value] of Object.entries(
      settings.ignoredInstanceConflicts
    )) {
      if (key.includes(oldRef)) {
        const parts = key.split('+')
        const newParts = parts.map((p) => (p === oldRef ? newRef : p))
        const newKey = newParts.sort().join('+')
        updates.push({ oldKey: key, newKey, value })
      }
    }
    for (const { oldKey, newKey, value } of updates) {
      delete settings.ignoredInstanceConflicts[oldKey]
      settings.ignoredInstanceConflicts[newKey] = value
      settingsChanged = true
    }
    if (updates.length > 0) {
      migrated.push('ignoredInstanceConflicts')
    }
  }

  // 5. Channel labels file
  const labelsPath = path.join(app.config.configPath, LABELS_FILENAME)
  try {
    const raw = fs.readFileSync(labelsPath, 'utf-8')
    const labels: Record<string, string> = JSON.parse(raw)
    const oldPrefix = oldRef + ':'
    const labelUpdates: Array<[string, string, string]> = []
    for (const [key, value] of Object.entries(labels)) {
      if (key.startsWith(oldPrefix)) {
        const suffix = key.slice(oldPrefix.length)
        labelUpdates.push([key, `${newRef}:${suffix}`, value])
      }
    }
    if (labelUpdates.length > 0) {
      for (const [oldKey, newKey, value] of labelUpdates) {
        delete labels[oldKey]
        labels[newKey] = value
      }
      fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2))
      migrated.push('channelLabels')
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      debug('Failed to migrate channel labels: %s', (e as Error).message)
    }
  }

  // 6. Clean up deltaCache for old sourceRef
  app.deltaCache.removeSource(oldRef as SourceRef)
  migrated.push('deltaCache')

  // 7. Persist settings
  if (settingsChanged) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeSettingsFile(app as any, settings, (err: Error) => {
      if (err) {
        console.error('Failed to save settings after sourceRef migration:', err)
      }
    })
  }

  // 8. Recompile priority engine
  app.activateSourcePriorities()

  // 9. Notify clients
  if (settings.sourceRanking) {
    app.emit('serverevent', {
      type: 'SOURCERANKING',
      data: settings.sourceRanking
    })
  }
  if (settings.sourcePriorities) {
    app.emit('serverevent', {
      type: 'SOURCEPRIORITIES',
      data: settings.sourcePriorities
    })
  }
  if (settings.sourceAliases) {
    app.emit('serverAdminEvent', {
      type: 'SOURCEALIASES',
      data: settings.sourceAliases
    })
  }

  if (migrated.length > 0) {
    console.log(
      `sourceRef migrated ${oldRef} -> ${newRef}: ${migrated.join(', ')}`
    )
  }
  debug(
    'Migration complete: %s -> %s (%s)',
    oldRef,
    newRef,
    migrated.join(', ')
  )
}
