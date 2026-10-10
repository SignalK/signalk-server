import type { MetaData } from '../../store'

const NOTIFICATIONS_PREFIX = 'notifications.'

// notifications.tanks.freshWater.2.currentLevel -> tanks.freshWater.2.currentLevel
export function notificationDataPath(path: string): string | undefined {
  return path.startsWith(NOTIFICATIONS_PREFIX)
    ? path.slice(NOTIFICATIONS_PREFIX.length)
    : undefined
}

export interface ResolvedDisplayName {
  name: string
  metaPath: string
}

// A row shows exactly the displayName stored at its own path — no
// ancestor inheritance, so what is displayed is always literally what is
// in the metadata. The single mapping rule: a notifications.<dataPath>
// row mirrors the name of the data path it notifies about.
export function resolveDisplayName(
  contextMeta: Record<string, MetaData> | undefined,
  path: string
): ResolvedDisplayName | null {
  if (!contextMeta || !path) return null
  const own = contextMeta[path]?.displayName
  if (typeof own === 'string' && own) {
    return { name: own, metaPath: path }
  }
  const dataPath = notificationDataPath(path)
  if (dataPath) {
    const mapped = contextMeta[dataPath]?.displayName
    if (typeof mapped === 'string' && mapped) {
      return { name: mapped, metaPath: dataPath }
    }
  }
  return null
}
