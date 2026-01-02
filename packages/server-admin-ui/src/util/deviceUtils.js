/**
 * Get a display label for a source reference by looking up device descriptions.
 *
 * @param {string} sourceRef - The source reference (e.g., 'ws.abc123' or 'ws.abc123.something')
 * @param {Array} devices - Array of device objects with clientId and description properties
 * @returns {string} The device description if found, otherwise the original sourceRef
 */
export function getDeviceDisplayLabel(sourceRef, devices = []) {
  if (sourceRef && sourceRef.startsWith('ws.')) {
    const device = devices.find(
      (d) =>
        sourceRef === `ws.${d.clientId}` ||
        sourceRef.startsWith(`ws.${d.clientId}.`)
    )
    if (device && device.description) {
      return device.description
    }
  }
  return sourceRef
}
