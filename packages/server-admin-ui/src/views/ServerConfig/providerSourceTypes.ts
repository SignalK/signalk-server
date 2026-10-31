// The wasm YDWG connection decodes in-process and has no N2K device of
// its own to claim an address with, so only the canboatjs ones offer it.
const YDWG_CREATE_DEVICE_TYPE = /^ydwg02-(.+-)?canboatjs$/

export const offersCreateDevice = (sourceType: string): boolean =>
  YDWG_CREATE_DEVICE_TYPE.test(sourceType)

// The wasm binary-framing sources emit decoded objects with no text
// form, so a log of them could not be replayed. j1939-wasm appears here
// only in configs that still store J1939 as an NMEA 2000 source.
const UNLOGGABLE_N2K_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'j1939-wasm',
  'maretron-ipg-wasm',
  'w2k-1-n2k-actisense-wasm',
  'ngt-1-wasm'
])

export const logsN2kSource = (sourceType: string): boolean =>
  !UNLOGGABLE_N2K_SOURCE_TYPES.has(sourceType)
