/**
 * Buffer-based string passing for Rust (and other non-AssemblyScript) plugins.
 *
 * The host allocates an output buffer in plugin memory and the export writes
 * its UTF-8 result there, returning the number of bytes written. When the
 * result does not fit, the export returns `-n` and the host allocates `n`
 * bytes and calls it once more with the same request.
 */

/** Initial output buffer for HTTP handlers and provider calls */
export const RESPONSE_BUFFER_BYTES = 64 * 1024
/** Initial output buffer for plugin metadata, endpoint lists and PUT results */
export const METADATA_BUFFER_BYTES = 8 * 1024
/** Largest buffer a plugin may request by returning a negative length */
export const MAX_BUFFER_ABI_RESPONSE_BYTES = 8 * 1024 * 1024

/** Memory and allocator exports a buffer-ABI plugin must provide */
export interface BufferAbiExports {
  memory: WebAssembly.Memory
  allocate: (size: number) => number
  deallocate?: (ptr: number, size: number) => void
}

/** A buffer-ABI export: pointer/length arguments in, written length (or `-needed`) out */
export type BufferAbiFunction = (...args: number[]) => number

const utf8Decoder = new TextDecoder('utf-8')

/**
 * Call a buffer-ABI export and return the string it wrote.
 *
 * With `request` the export is called as
 * `(request_ptr, request_len, out_ptr, out_max_len) -> written_len`,
 * without it as `(out_ptr, out_max_len) -> written_len`.
 */
export function callBufferAbi(
  wasmExports: BufferAbiExports,
  name: string,
  fn: BufferAbiFunction,
  initialSize: number,
  request?: string
): string {
  const requestBytes =
    request === undefined ? undefined : Buffer.from(request, 'utf8')
  let requestPtr = 0
  if (requestBytes) {
    requestPtr = wasmExports.allocate(requestBytes.length)
    new Uint8Array(wasmExports.memory.buffer).set(requestBytes, requestPtr)
  }

  /**
   * Call the export with a fresh `size` byte output buffer, always freeing it
   * so a throwing export or an oversized result does not leak plugin memory.
   */
  const invoke = (size: number): { written: number; text: string } => {
    const outPtr = wasmExports.allocate(size)
    try {
      const written = requestBytes
        ? fn(requestPtr, requestBytes.length, outPtr, size)
        : fn(outPtr, size)
      if (written > size) {
        throw new Error(
          `${name} reported ${written} bytes written into a ${size} byte buffer`
        )
      }
      const text =
        written > 0
          ? utf8Decoder.decode(
              new Uint8Array(wasmExports.memory.buffer, outPtr, written)
            )
          : ''
      return { written, text }
    } finally {
      wasmExports.deallocate?.(outPtr, size)
    }
  }

  try {
    const first = invoke(initialSize)
    if (first.written >= 0) {
      return first.text
    }

    const needed = -first.written
    if (needed > MAX_BUFFER_ABI_RESPONSE_BYTES) {
      throw new Error(
        `${name} requested a ${needed} byte response buffer, exceeding the ${MAX_BUFFER_ABI_RESPONSE_BYTES} byte limit`
      )
    }
    const second = invoke(needed)
    if (second.written < 0) {
      throw new Error(
        `${name} requested ${-second.written} bytes after being given the ${needed} bytes it asked for`
      )
    }
    return second.text
  } finally {
    if (requestBytes) {
      wasmExports.deallocate?.(requestPtr, requestBytes.length)
    }
  }
}
