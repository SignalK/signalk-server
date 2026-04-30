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
      sourcePriorities?: Record<
        string,
        Array<{ sourceRef: string; timeout: number }>
      >
      sourceAliases?: Record<string, string>
      ignoredInstanceConflicts?: Record<string, string>
      priorityGroups?: Array<{ id: string; sources: string[] }>
    }
  }
  activateSourcePriorities: () => void
  deltaCache: {
    removeSource(sourceRef: SourceRef): void
  }
  // The Signal K sources tree (`/signalk/v1/api/sources`). Optional so the
  // existing migration tests don't need to fabricate one — the takeover
  // guard only fires when the tree is present and the old canName is
  // still observed under a different bus address.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signalk?: { sources?: any }
  emit(event: string, ...args: unknown[]): boolean
}

/**
 * canboatjs fires `n2kSourceChanged` whenever the same bus address
 * starts claiming a different CAN Name. That can mean two very
 * different things:
 *
 *   - "Reclaim": one physical device rebooted, was reassigned, or
 *     swapped its address — the old CAN Name disappears from the bus.
 *   - "Takeover": a different physical device joined the bus and
 *     happened to land on an address the original device was already
 *     using; the original device then arbitrates and moves to a new
 *     address — both CAN Names continue to exist on the bus.
 *
 * The migration code rewrites every reference to oldRef so it points
 * at newRef. That is correct for a reclaim but corrupts the saved
 * priority group on a takeover, since the original device's rank
 * silently moves to the unrelated newcomer.
 *
 * Distinguish the two by looking at app.signalk.sources: if any device
 * under the same provider still carries the old CAN Name (under any
 * address), this is a takeover and the migration must be skipped.
 */
function oldCanNameStillOnBus(app: MigrationApp, oldRef: string): boolean {
  const sources = app.signalk?.sources
  if (!sources || typeof sources !== 'object') return false
  const dotIdx = oldRef.indexOf('.')
  if (dotIdx === -1) return false
  const providerId = oldRef.slice(0, dotIdx)
  // CAN Name suffixes are 16-hex strings. Persisted refs are normalised
  // to lowercase upstream, but a settings file edited by hand or
  // imported from another tool may still have uppercase characters —
  // compare case-insensitively so the takeover guard isn't fooled by
  // mixed casing. Plugin sources have no canName suffix and fall
  // through to the normal migration path.
  const oldCanName = oldRef.slice(dotIdx + 1).toLowerCase()
  if (!/^[0-9a-f]{16}$/.test(oldCanName)) return false
  const conn = sources[providerId]
  if (!conn || typeof conn !== 'object') return false
  for (const [key, dev] of Object.entries(conn as Record<string, unknown>)) {
    if (key === 'type' || key === 'label') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canName = (dev as any)?.n2k?.canName
    if (typeof canName === 'string' && canName.toLowerCase() === oldCanName) {
      return true
    }
  }
  return false
}

export function migrateSourceRef(
  app: MigrationApp,
  oldRef: string,
  newRef: string
): void {
  if (oldCanNameStillOnBus(app, oldRef)) {
    debug(
      'Skipping migration %s -> %s: old CAN Name is still claimed by another device on the bus (address takeover, not a reclaim).',
      oldRef,
      newRef
    )
    return
  }
  const settings = app.config.settings
  let settingsChanged = false
  const migrated = new Set<string>()

  // 1. sourcePriorities (path-level) — dedupe per path if newRef already present
  if (settings.sourcePriorities) {
    for (const [, entries] of Object.entries(settings.sourcePriorities)) {
      if (!Array.isArray(entries)) continue
      const hasNewRef = entries.some((e) => e.sourceRef === newRef)
      if (hasNewRef) {
        const before = entries.length
        const filtered = entries.filter((e) => e.sourceRef !== oldRef)
        if (filtered.length !== before) {
          entries.length = 0
          entries.push(...filtered)
          settingsChanged = true
          migrated.add('sourcePriorities')
        }
      } else {
        for (const entry of entries) {
          if (entry.sourceRef === oldRef) {
            entry.sourceRef = newRef
            settingsChanged = true
            migrated.add('sourcePriorities')
          }
        }
      }
    }
  }

  // 2. sourceAliases — keep existing newRef alias if present
  if (settings.sourceAliases && oldRef in settings.sourceAliases) {
    if (!(newRef in settings.sourceAliases)) {
      settings.sourceAliases[newRef] = settings.sourceAliases[oldRef]
    }
    delete settings.sourceAliases[oldRef]
    settingsChanged = true
    migrated.add('sourceAliases')
  }

  // 3. ignoredInstanceConflicts (keys are "refA+refB" sorted pairs)
  if (settings.ignoredInstanceConflicts) {
    const updates: Array<{ oldKey: string; newKey: string; value: string }> = []
    for (const [key, value] of Object.entries(
      settings.ignoredInstanceConflicts
    )) {
      const parts = key.split('+')
      if (parts.includes(oldRef)) {
        const newParts = parts.map((p) => (p === oldRef ? newRef : p))
        const newKey = newParts.sort().join('+')
        updates.push({ oldKey: key, newKey, value })
      }
    }
    for (const { oldKey, newKey, value } of updates) {
      delete settings.ignoredInstanceConflicts[oldKey]
      if (!(newKey in settings.ignoredInstanceConflicts)) {
        settings.ignoredInstanceConflicts[newKey] = value
      }
      settingsChanged = true
    }
    if (updates.length > 0) {
      migrated.add('ignoredInstanceConflicts')
    }
  }

  // 4. priorityGroups — rewrite or dedupe sourceRef inside each group
  if (settings.priorityGroups) {
    for (const group of settings.priorityGroups) {
      const hasNewRef = group.sources.includes(newRef)
      if (hasNewRef) {
        const before = group.sources.length
        const filtered = group.sources.filter((ref) => ref !== oldRef)
        if (filtered.length !== before) {
          group.sources = filtered
          settingsChanged = true
          migrated.add('priorityGroups')
        }
      } else {
        const idx = group.sources.indexOf(oldRef)
        if (idx !== -1) {
          group.sources[idx] = newRef
          settingsChanged = true
          migrated.add('priorityGroups')
        }
      }
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
        if (!(newKey in labels)) {
          labels[newKey] = value
        }
      }
      // Sync write keeps callers (including the migration tests) able to
      // observe the new file shape immediately on return. Channel labels
      // files are tiny (one entry per N2K instance) so the blocking cost
      // is negligible at startup.
      fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2))
      migrated.add('channelLabels')
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      debug('Failed to migrate channel labels: %s', (e as Error).message)
    }
  }

  const finalize = () => {
    // 6. Clean up deltaCache for old sourceRef. Only safe to do once
    // settings have been persisted — otherwise a write failure would
    // leave disk pointing at the old ref while the cache has already
    // dropped its leaf, producing two-second-of-amnesia on restart.
    app.deltaCache.removeSource(oldRef as SourceRef)

    // 7. Recompile priority engine
    app.activateSourcePriorities()

    // 8. Notify clients (only for sections that were actually migrated)
    if (migrated.has('sourcePriorities') && settings.sourcePriorities) {
      app.emit('serverevent', {
        type: 'SOURCEPRIORITIES',
        data: settings.sourcePriorities
      })
    }
    if (migrated.has('sourceAliases') && settings.sourceAliases) {
      app.emit('serverAdminEvent', {
        type: 'SOURCEALIASES',
        data: settings.sourceAliases
      })
    }
    if (migrated.has('priorityGroups') && settings.priorityGroups) {
      app.emit('serverAdminEvent', {
        type: 'PRIORITYGROUPS',
        data: settings.priorityGroups
      })
    }

    if (migrated.size > 0) {
      console.log(
        `sourceRef migrated ${oldRef} -> ${newRef}: ${[...migrated].join(', ')}`
      )
    }
    debug(
      'Migration complete: %s -> %s (%s)',
      oldRef,
      newRef,
      [...migrated].join(', ')
    )
  }

  if (settingsChanged) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeSettingsFile(app as any, settings, (err: Error) => {
      if (err) {
        console.error('Failed to save settings after sourceRef migration:', err)
        // Still finalise: in-memory state has already been mutated
        // (settings, deltaCache references), so skipping the priority
        // engine recompile and event broadcast would leave the running
        // server inconsistent with itself. The disk/memory divergence
        // self-heals on the next successful settings write.
      }
      finalize()
    })
  } else {
    // Nothing to persist (e.g. only channelLabels file was rewritten).
    finalize()
  }
}
