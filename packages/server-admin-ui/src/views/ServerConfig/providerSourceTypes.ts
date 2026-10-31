// The wasm YDWG connection decodes in-process and has no N2K device of
// its own to claim an address with, so only the canboatjs ones offer it.
const YDWG_CREATE_DEVICE_TYPE = /^ydwg02-(.+-)?canboatjs$/

export const offersCreateDevice = (sourceType: string): boolean =>
  YDWG_CREATE_DEVICE_TYPE.test(sourceType)
