/*
 * Device Name Resolution Utility
 * Resolves WebSocket client IDs to user-friendly display names
 */

interface Device {
  clientId: string
  description?: string
}

interface ClientInfo {
  skPrincipal?: { name?: string }
  userAgent?: string
}

export function resolveDeviceName(
  clientId: string,
  devices: Device[],
  clientInfo?: ClientInfo
): string {
  // 1. Device description from registry
  const device = devices.find((d) => d.clientId === clientId)
  if (device?.description) {
    return device.description
  }

  // 2. Principal name from authentication
  if (clientInfo?.skPrincipal?.name) {
    return clientInfo.skPrincipal.name
  }

  // 3. User agent (shortened)
  if (clientInfo?.userAgent) {
    const ua = clientInfo.userAgent
    if (ua.includes('SensESP')) {
      return 'SensESP Device'
    } else if (ua.includes('SignalK')) {
      return 'SignalK Client'
    } else if (ua.includes('OpenCPN')) {
      return 'OpenCPN'
    } else if (ua.includes('Chrome') || ua.includes('Firefox') || ua.includes('Safari')) {
      return 'Web Browser'
    } else {
      // Take first meaningful part of user agent
      const parts = ua.split(/[\s\/\(]/)
      return parts[0] || 'Unknown Client'
    }
  }

  // 4. Fall back to client ID
  return clientId
}