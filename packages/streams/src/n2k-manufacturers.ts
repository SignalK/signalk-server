// A connection's manufacturer filter (canboat/canboatjs#588): keep only the
// devices of some manufacturers, or drop those of some. canboatjs applies
// it before decoding, as allowManufacturers or denyManufacturers; the
// n2k-signalk stream leaves a dropped device out of the sources too, as
// canboatjs still passes on its address claim and product information.

export type ManufacturerFilterMode = 'allow' | 'deny'

interface ManufacturerFilterOptions {
  filtersEnabled?: boolean
  manufacturerFilter?: string
  manufacturers?: unknown
}

/**
 * The canboatjs option for the connection's manufacturer filter:
 * allowManufacturers or denyManufacturers, or none when the filters are
 * off, no mode is chosen, or no manufacturer is listed.
 */
export function manufacturerFilterOption(
  options: ManufacturerFilterOptions
):
  | { allowManufacturers: string[] }
  | { denyManufacturers: string[] }
  | undefined {
  if (!options.filtersEnabled) {
    return undefined
  }
  const names = (
    Array.isArray(options.manufacturers) ? options.manufacturers : []
  )
    .map((name) => String(name).trim())
    .filter((name) => name !== '')
  if (names.length === 0) {
    return undefined
  }
  if (options.manufacturerFilter === 'allow') {
    return { allowManufacturers: names }
  }
  if (options.manufacturerFilter === 'deny') {
    return { denyManufacturers: names }
  }
  return undefined
}

/** Whether the installed canboatjs can filter by manufacturer. */
export function canboatjsSupportsManufacturerFilter(
  canboatjs: unknown = require('@canboat/canboatjs')
): boolean {
  return (
    typeof (canboatjs as { parseManufacturers?: unknown })
      .parseManufacturers === 'function'
  )
}

/** What a device's metadata says about its manufacturer. */
export interface DeviceManufacturer {
  // From its address claim: a code, or the name canboatjs gives it.
  manufacturerCode?: unknown
  // Its CAN NAME, 16 hex digits.
  canName?: unknown
}

/**
 * The manufacturer code of a device: its address claim's manufacturer
 * code, as a number or a name, or else the top 11 bits of its CAN NAME's
 * low 32.
 */
export function manufacturerCodeOf(
  device: DeviceManufacturer,
  codeOfName: (name: string) => number | undefined
): number | undefined {
  const { manufacturerCode, canName } = device
  if (typeof manufacturerCode === 'number') {
    return manufacturerCode
  }
  if (typeof manufacturerCode === 'string' && manufacturerCode !== '') {
    const code = codeOfName(manufacturerCode)
    if (code !== undefined) {
      return code
    }
  }
  if (typeof canName === 'string' && /^[0-9a-fA-F]{16}$/.test(canName)) {
    return parseInt(canName.slice(-8), 16) >>> 21
  }
  return undefined
}

/**
 * Whether a device of this manufacturer passes the filter. One whose
 * manufacturer isn't known passes, as there is nothing to judge it by.
 */
export function manufacturerPasses(
  code: number | undefined,
  option: ReturnType<typeof manufacturerFilterOption>,
  codesOf: (names: string[]) => number[]
): boolean {
  if (option === undefined || code === undefined) {
    return true
  }
  if ('allowManufacturers' in option) {
    return codesOf(option.allowManufacturers).includes(code)
  }
  return !codesOf(option.denyManufacturers).includes(code)
}
