async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0)
        fileName = __liftString(fileName >>> 0)
        lineNumber = lineNumber >>> 0
        columnNumber = columnNumber >>> 0
        ;(() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`)
        })()
      },
      sk_debug(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_debug_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_debug(msgPtr, msgLen)
      },
      sk_set_status(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_set_status_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_set_status(msgPtr, msgLen)
      },
      sk_handle_message(deltaPtr, deltaLen, version) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_handle_message_ffi(usize, usize, i32) => void
        deltaPtr = deltaPtr >>> 0
        deltaLen = deltaLen >>> 0
        sk_handle_message(deltaPtr, deltaLen, version)
      }
    })
  }
  const { exports } = await WebAssembly.instantiate(module, adaptedImports)
  const memory = exports.memory || imports.env.memory
  const adaptedExports = Object.setPrototypeOf(
    {
      plugin_name() {
        // assembly/index/plugin_name() => ~lib/string/String
        return __liftString(exports.plugin_name() >>> 0)
      },
      plugin_schema() {
        // assembly/index/plugin_schema() => ~lib/string/String
        return __liftString(exports.plugin_schema() >>> 0)
      },
      http_endpoints() {
        // assembly/index/http_endpoints() => ~lib/string/String
        return __liftString(exports.http_endpoints() >>> 0)
      },
      handle_get_info(requestPtr, requestLen) {
        // assembly/index/handle_get_info(usize, usize) => ~lib/string/String
        return __liftString(
          exports.handle_get_info(requestPtr, requestLen) >>> 0
        )
      },
      handle_get_status(requestPtr, requestLen) {
        // assembly/index/handle_get_status(usize, usize) => ~lib/string/String
        return __liftString(
          exports.handle_get_status(requestPtr, requestLen) >>> 0
        )
      }
    },
    exports
  )
  function __liftString(pointer) {
    if (!pointer) return null
    const end =
        (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
      memoryU16 = new Uint16Array(memory.buffer)
    let start = pointer >>> 1,
      string = ''
    while (end - start > 1024)
      string += String.fromCharCode(
        ...memoryU16.subarray(start, (start += 1024))
      )
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
  }
  return adaptedExports
}
export const {
  memory,
  __new,
  __pin,
  __unpin,
  __collect,
  __rtti_base,
  plugin_name,
  plugin_schema,
  plugin_start,
  plugin_stop,
  poll,
  http_endpoints,
  handle_get_info,
  handle_get_status
} = await (async (url) =>
  instantiate(
    await (async () => {
      const isNodeOrBun =
        typeof process != 'undefined' &&
        process.versions != null &&
        (process.versions.node != null || process.versions.bun != null)
      if (isNodeOrBun) {
        return globalThis.WebAssembly.compile(
          await (await import('node:fs/promises')).readFile(url)
        )
      } else {
        return await globalThis.WebAssembly.compileStreaming(
          globalThis.fetch(url)
        )
      }
    })(),
    {}
  ))(new URL('plugin.wasm', import.meta.url))
