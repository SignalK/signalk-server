import * as __import0 from 'as-fetch'
async function instantiate(module, imports = {}) {
  const __module0 = imports['as-fetch']
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      sk_debug(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_debug_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_debug(msgPtr, msgLen)
      },
      sk_has_capability(capPtr, capLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/network/sk_has_capability_ffi(usize, usize) => i32
        capPtr = capPtr >>> 0
        capLen = capLen >>> 0
        return sk_has_capability(capPtr, capLen)
      },
      sk_set_error(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_set_error_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_set_error(msgPtr, msgLen)
      },
      sk_register_weather_provider(namePtr, nameLen) {
        // assembly/index/sk_register_weather_provider(usize, usize) => i32
        namePtr = namePtr >>> 0
        nameLen = nameLen >>> 0
        return sk_register_weather_provider(namePtr, nameLen)
      },
      sk_handle_message(deltaPtr, deltaLen, version) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_handle_message_ffi(usize, usize, i32) => void
        deltaPtr = deltaPtr >>> 0
        deltaLen = deltaLen >>> 0
        sk_handle_message(deltaPtr, deltaLen, version)
      },
      sk_set_status(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_set_status_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_set_status(msgPtr, msgLen)
      }
    }),
    'as-fetch': Object.assign(Object.create(__module0), {
      _initAsyncify(asyncify_data_ptr, stack_pointer) {
        // ~lib/as-fetch/sync/_initAsyncify(usize, usize) => void
        asyncify_data_ptr = asyncify_data_ptr >>> 0
        stack_pointer = stack_pointer >>> 0
        __module0._initAsyncify(asyncify_data_ptr, stack_pointer)
      },
      _fetchGETSync(url, mode, headers) {
        // ~lib/as-fetch/sync/_fetchGETSync(~lib/string/String, i32, ~lib/array/Array<~lib/array/Array<~lib/string/String>>) => usize
        url = __liftString(url >>> 0)
        headers = __liftArray(
          (pointer) =>
            __liftArray(
              (pointer) => __liftString(__getU32(pointer)),
              2,
              __getU32(pointer)
            ),
          2,
          headers >>> 0
        )
        return __module0._fetchGETSync(url, mode, headers)
      },
      _fetchPOSTSync(url, mode, headers, body) {
        // ~lib/as-fetch/sync/_fetchPOSTSync(~lib/string/String, i32, ~lib/array/Array<~lib/array/Array<~lib/string/String>>, ~lib/arraybuffer/ArrayBuffer) => usize
        url = __liftString(url >>> 0)
        headers = __liftArray(
          (pointer) =>
            __liftArray(
              (pointer) => __liftString(__getU32(pointer)),
              2,
              __getU32(pointer)
            ),
          2,
          headers >>> 0
        )
        body = __liftBuffer(body >>> 0)
        return __module0._fetchPOSTSync(url, mode, headers, body)
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
      weather_get_observations(requestJson) {
        // assembly/index/weather_get_observations(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(exports.weather_get_observations(requestJson) >>> 0)
      },
      weather_get_forecasts(requestJson) {
        // assembly/index/weather_get_forecasts(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(exports.weather_get_forecasts(requestJson) >>> 0)
      },
      weather_get_warnings(requestJson) {
        // assembly/index/weather_get_warnings(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(exports.weather_get_warnings(requestJson) >>> 0)
      }
    },
    exports
  )
  function __liftBuffer(pointer) {
    if (!pointer) return null
    return memory.buffer.slice(
      pointer,
      pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]
    )
  }
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
  function __lowerString(value) {
    if (value == null) return 0
    const length = value.length,
      pointer = exports.__new(length << 1, 2) >>> 0,
      memoryU16 = new Uint16Array(memory.buffer)
    for (let i = 0; i < length; ++i)
      memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i)
    return pointer
  }
  function __liftArray(liftElement, align, pointer) {
    if (!pointer) return null
    const dataStart = __getU32(pointer + 4),
      length = __dataview.getUint32(pointer + 12, true),
      values = new Array(length)
    for (let i = 0; i < length; ++i)
      values[i] = liftElement(dataStart + ((i << align) >>> 0))
    return values
  }
  function __notnull() {
    throw TypeError('value must not be null')
  }
  let __dataview = new DataView(memory.buffer)
  function __getU32(pointer) {
    try {
      return __dataview.getUint32(pointer, true)
    } catch {
      __dataview = new DataView(memory.buffer)
      return __dataview.getUint32(pointer, true)
    }
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
  weather_get_observations,
  weather_get_forecasts,
  weather_get_warnings
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
    {
      'as-fetch': __maybeDefault(__import0)
    }
  ))(new URL('plugin.wasm', import.meta.url))
function __maybeDefault(module) {
  return typeof module.default === 'object' && Object.keys(module).length == 1
    ? module.default
    : module
}
