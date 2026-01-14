/**
 * WASM Format Detection
 *
 * Utilities for detecting WASM binary formats
 */

import { WasmFormat } from '../types'

/**
 * Detect the format of a WASM binary by inspecting the magic bytes
 * - WASI P1 modules start with: 0x00 0x61 0x73 0x6D 0x01 0x00 0x00 0x00 (version 1)
 */
export function detectWasmFormat(buffer: Buffer): WasmFormat {
  if (buffer.length < 8) {
    return 'unknown'
  }

  // Check WASM magic number: \0asm
  if (
    buffer[0] !== 0x00 ||
    buffer[1] !== 0x61 ||
    buffer[2] !== 0x73 ||
    buffer[3] !== 0x6d
  ) {
    return 'unknown'
  }

  // Check version byte (byte 4)
  const version = buffer[4]

  if (version === 0x01) {
    return 'wasi-p1'
  }

  return 'unknown'
}
