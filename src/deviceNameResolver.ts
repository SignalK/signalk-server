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

/**
 * Resolves a WebSocket client ID to a user-friendly display name using a 4-level priority system.
 *
 * This function attempts to find the most descriptive name for a connected client by checking
 * multiple sources in order of preference. The goal is to provide meaningful device names
 * in the Dashboard instead of cryptic WebSocket IDs like "ws.85d5c860-d34f-42ba-b9f1-b4ba78de8e95".
 *
 * Resolution Priority (first match wins):
 * 1. **Device Description from Registry** - If the device is registered in the security system,
 *    use its configured description (e.g., "SensESP device: esp32-wireless")
 * 2. **Principal Name from Authentication** - If the client is authenticated, use the principal's
 *    name from the authentication context
 * 3. **Parsed User Agent** - Extract a meaningful name from the User-Agent header:
 *    - "SensESP" → "SensESP Device"
 *    - "SignalK" → "SignalK Client"
 *    - "OpenCPN" → "OpenCPN"
 *    - Browser agents → "Web Browser"
 *    - Other agents → First meaningful part of the UA string
 * 4. **Client ID Fallback** - If no other information is available, return the original client ID
 *
 * @param clientId - The WebSocket client ID to resolve (e.g., "ws.123e4567-e89b-12d3-a456-426614174000")
 * @param devices - Array of registered devices from the device registry cache
 * @param clientInfo - Optional client information including authentication principal and user agent
 * @returns A user-friendly display name for the client
 *
 * @example
 * // With a registered device
 * resolveDeviceName('esp32-001', devices, clientInfo)
 * // Returns: "SensESP device: esp32-wireless"
 *
 * @example
 * // With only user agent
 * resolveDeviceName('ws.abc123', [], { userAgent: 'OpenCPN/5.6.2' })
 * // Returns: "OpenCPN"
 *
 * @example
 * // Fallback case
 * resolveDeviceName('ws.xyz789', [], {})
 * // Returns: "ws.xyz789"
 */
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
    } else if (
      ua.includes('Chrome') ||
      ua.includes('Firefox') ||
      ua.includes('Safari')
    ) {
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
