/*
 * Build a cross-transport device identity index from the FullSignalK
 * `sources` tree.
 *
 * The sources tree is organised as `sources[label][subKey]`, where subKey
 * is typically a CAN Name (when useCanName is set), an N2K address, or a
 * $source suffix. Each leaf's `n2k` object may also carry a canName field
 * even when the subKey is the address — that is how we link the same
 * physical device across providers that differ in their useCanName
 * configuration.
 *
 * Output: for every device we managed to identify, a list of the
 * $source refs it currently appears as. The caller can then collapse
 * UI rows that share an identity to a single device row.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SourcesTree = Record<string, any>

export interface DeviceIdentity {
  canName: string
  manufacturerCode?: string
  modelId?: string
  productCode?: number
  sourceRefs: string[]
}

// CAN Names are 64-bit hex strings. canboatjs emits them lowercase, but
// remote Signal K servers or other gateways may use uppercase — the NMEA
// 2000 standard treats hex case as insignificant.
const CAN_NAME = /^[0-9a-f]{16}$/i

export function buildDeviceIdentities(sources: SourcesTree): DeviceIdentity[] {
  const byCanName = new Map<string, DeviceIdentity>()

  const ensure = (canName: string): DeviceIdentity => {
    let d = byCanName.get(canName)
    if (!d) {
      d = { canName, sourceRefs: [] }
      byCanName.set(canName, d)
    }
    return d
  }

  const recordIdentity = (
    d: DeviceIdentity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    n2k: Record<string, any> | undefined
  ) => {
    if (!n2k) return
    if (typeof n2k.manufacturerCode === 'string' && !d.manufacturerCode) {
      d.manufacturerCode = n2k.manufacturerCode
    }
    if (typeof n2k.modelId === 'string' && !d.modelId) {
      d.modelId = n2k.modelId
    }
    if (typeof n2k.productCode === 'number' && d.productCode === undefined) {
      d.productCode = n2k.productCode
    }
  }

  for (const label of Object.keys(sources)) {
    const labelNode = sources[label]
    if (!labelNode || typeof labelNode !== 'object') continue

    for (const subKey of Object.keys(labelNode)) {
      if (subKey === 'label' || subKey === 'type') continue
      const sub = labelNode[subKey]
      if (!sub || typeof sub !== 'object') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n2k = (sub as any).n2k as Record<string, any> | undefined

      // Preferred identity: explicit canName on the n2k block (works
      // regardless of whether subKey is an address or the CAN Name).
      // Lowercase here so a provider that ships uppercase hex doesn't
      // produce a separate identity from one that ships lowercase
      // (NMEA 2000 treats hex case as insignificant).
      const explicitCanName =
        typeof n2k?.canName === 'string' && CAN_NAME.test(n2k.canName)
          ? n2k.canName.toLowerCase()
          : undefined
      // Fallback: subKey itself is a CAN Name (provider uses useCanName).
      const canName =
        explicitCanName ??
        (CAN_NAME.test(subKey) ? subKey.toLowerCase() : undefined)
      if (!canName) continue

      const d = ensure(canName)
      // A provider may publish the same device under both its N2K address
      // (e.g. "YDEN02.159") and its CAN Name (e.g.
      // "YDEN02.c0788c00e7e04312") depending on useCanName and on which
      // form the delta emitter picked for $source. Expose both so the UI
      // can recognise either form as the same device.
      const refs: string[] = [`${label}.${subKey}`]
      if (subKey !== canName) {
        refs.push(`${label}.${canName}`)
      }
      for (const ref of refs) {
        if (!d.sourceRefs.includes(ref)) {
          d.sourceRefs.push(ref)
        }
      }
      recordIdentity(d, n2k)
    }
  }

  return [...byCanName.values()].sort((a, b) =>
    a.canName.localeCompare(b.canName)
  )
}
