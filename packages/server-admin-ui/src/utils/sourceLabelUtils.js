function getWsSourceMetadata(sourceRef, sources) {
  if (
    !sourceRef?.startsWith('ws.') ||
    !sources ||
    typeof sources !== 'object'
  ) {
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

  const node = wsSources[wsDeviceId]
  return node && typeof node === 'object' ? node : null
}

export function getSourceDisplayLabel(sourceRef, sources = {}) {
  const metadata = getWsSourceMetadata(sourceRef, sources)
  const description = metadata?.n2k?.description
  return description || sourceRef
}
