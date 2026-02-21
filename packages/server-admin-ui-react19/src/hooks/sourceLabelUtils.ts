interface SourceMetadata {
  n2k?: {
    description?: string
  }
  [key: string]: unknown
}

function getWsSourceMetadata(
  sourceRef: string,
  sources: Record<string, unknown>
): SourceMetadata | null {
  if (!sourceRef?.startsWith('ws.') || !sources || typeof sources !== 'object') {
    return null
  }

  const parts = sourceRef.split('.')
  const wsDeviceId = parts[1]
  if (!wsDeviceId) {
    return null
  }

  const wsSources = sources.ws
  if (!wsSources || typeof wsSources !== 'object') {
    return null
  }

  const node = (wsSources as Record<string, unknown>)[wsDeviceId]
  return node && typeof node === 'object' ? (node as SourceMetadata) : null
}

export function getSourceDisplayLabel(
  sourceRef: string,
  sources: Record<string, unknown> = {}
): string {
  const metadata = getWsSourceMetadata(sourceRef, sources)
  const description = metadata?.n2k?.description
  return description || sourceRef
}
