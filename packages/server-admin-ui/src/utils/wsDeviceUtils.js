/**
 * Utility functions for WebSocket device name resolution
 *
 * WS device IDs have the format "ws.{clientId}" where the clientId
 * may have dots replaced with underscores. These IDs are not
 * user-friendly, so we provide utilities to resolve them to
 * human-readable device descriptions when available.
 *
 * Note: Delta $source can be composite like "ws.device_id.nmea0183.GGA"
 * where the device part is followed by additional source path info.
 */

/**
 * Converts a device clientId to the format used in WS source IDs
 * by replacing dots with underscores.
 *
 * @param {string} clientId - The device clientId (e.g., "my.device.id")
 * @returns {string} The WS format (e.g., "my_device_id")
 */
export function clientIdToWsFormat(clientId) {
  if (!clientId) return ''
  return clientId.replace(/\./g, '_')
}

/**
 * Finds a device that matches the given WS source ID.
 * The source ID may be composite (e.g., "ws.device_id.nmea0183.GGA")
 * so we check if any device's clientId matches as a prefix.
 *
 * @param {string} wsSourceId - The WS source ID (e.g., "ws.device_id" or "ws.device_id.path.info")
 * @param {Array} devices - Array of device objects with clientId property
 * @returns {Object|null} The matching device or null
 */
export function findDeviceByWsSource(wsSourceId, devices) {
  if (
    !wsSourceId ||
    !wsSourceId.startsWith('ws.') ||
    !devices ||
    !Array.isArray(devices)
  ) {
    return null
  }

  // Get the part after "ws."
  const sourceWithoutPrefix = wsSourceId.slice(3)

  // Find a device whose clientId (in ws format) matches the start of the source
  for (const device of devices) {
    if (device && device.clientId) {
      const wsFormatClientId = clientIdToWsFormat(device.clientId)
      // Check if source starts with this device's ID
      // Must be exact match or followed by a dot (to avoid partial matches)
      if (
        sourceWithoutPrefix === wsFormatClientId ||
        sourceWithoutPrefix.startsWith(wsFormatClientId + '.')
      ) {
        return device
      }
    }
  }

  return null
}

/**
 * Gets the display name for a WebSocket source ID.
 * Returns the device description if available, otherwise the original ID.
 *
 * @param {string} wsSourceId - The WebSocket source ID (e.g., "ws.device_id" or "ws.device_id.path")
 * @param {Array} devices - Array of device objects with clientId and description
 * @returns {string} The display name (description or original ID)
 */
export function getWsDeviceDisplayName(wsSourceId, devices) {
  if (!wsSourceId || !wsSourceId.startsWith('ws.')) {
    return wsSourceId
  }

  const device = findDeviceByWsSource(wsSourceId, devices)

  // Return description if it exists and is not empty
  if (device && device.description && device.description.trim() !== '') {
    return device.description
  }

  return wsSourceId
}

/**
 * Gets the display name for any source ID, handling both WS and non-WS sources.
 * For WS sources, attempts to resolve to device description.
 * For non-WS sources, returns the ID as-is.
 *
 * @param {string} sourceId - The source ID (e.g., "ws.client_123" or "nmea0183-1")
 * @param {Array} devices - Array of device objects (can be null/undefined)
 * @returns {string} The display name
 */
export function getSourceDisplayName(sourceId, devices) {
  if (!sourceId) {
    return sourceId
  }

  if (sourceId.startsWith('ws.')) {
    return getWsDeviceDisplayName(sourceId, devices)
  }

  return sourceId
}

/**
 * Checks if a source/provider ID is a WebSocket device
 *
 * @param {string} id - The source or provider ID
 * @returns {boolean} True if it's a WebSocket device ID
 */
export function isWsDevice(id) {
  return id && typeof id === 'string' && id.startsWith('ws.')
}
