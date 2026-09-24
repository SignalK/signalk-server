// ISO 11783 NAME: bits 0-20 unique number, bits 21-31 manufacturer code.
// The server decodes the same key (@signalk/streams n2k-instance-groups).
const CAN_NAME_PATTERN = /^[0-9a-f]{1,16}$/i
const LOW_WORD_HEX_DIGITS = 8
const UNIQUE_NUMBER_BITS = 21
const UNIQUE_NUMBER_MASK = 0x1fffff
const MANUFACTURER_CODE_MASK = 0x7ff

/**
 * `<manufacturer code>:<unique number>` from a canName hex string: the key
 * instance path mapping rules are stored under.
 */
export function deviceKeyFromCanName(canName: string): string | undefined {
  if (!CAN_NAME_PATTERN.test(canName)) return undefined
  const lowWord = parseInt(canName.slice(-LOW_WORD_HEX_DIGITS), 16)
  const manufacturerCode =
    (lowWord >>> UNIQUE_NUMBER_BITS) & MANUFACTURER_CODE_MASK
  return `${manufacturerCode}:${lowWord & UNIQUE_NUMBER_MASK}`
}

interface NamedDevice {
  sourceRef: string
  canName?: string
}

/**
 * The other online devices whose NAME holds the device's key, its
 * manufacturer code and unique number, once per NAME. Instance path mappings are
 * stored under that key, so they apply to these devices too. The same NAME
 * on another connection is the same device, and an offline entry can be the
 * device's own NAME from before a device instance change.
 */
export function devicesSharingKey<D extends NamedDevice>(
  device: D,
  deviceKey: string,
  devices: readonly D[],
  isOnline: (device: D) => boolean
): D[] {
  if (!isOnline(device)) return []
  const seen = new Set<string | undefined>([device.canName])
  return devices.filter((other) => {
    const { canName } = other
    if (canName === undefined || seen.has(canName)) return false
    if (deviceKeyFromCanName(canName) !== deviceKey || !isOnline(other)) {
      return false
    }
    seen.add(canName)
    return true
  })
}
