async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      sk_debug(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_debug_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_debug(msgPtr, msgLen)
      },
      sk_register_resource_provider(typePtr, typeLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/resources/sk_register_resource_provider_ffi(usize, usize) => i32
        typePtr = typePtr >>> 0
        typeLen = typeLen >>> 0
        return sk_register_resource_provider(typePtr, typeLen)
      },
      sk_set_status(msgPtr, msgLen) {
        // ~lib/@signalk/assemblyscript-plugin-sdk/assembly/api/sk_set_status_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0
        msgLen = msgLen >>> 0
        sk_set_status(msgPtr, msgLen)
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
      resources_list_resources(queryJson) {
        // assembly/index/resources_list_resources(~lib/string/String) => ~lib/string/String
        queryJson = __lowerString(queryJson) || __notnull()
        return __liftString(exports.resources_list_resources(queryJson) >>> 0)
      },
      resources_get_resource(requestJson) {
        // assembly/index/resources_get_resource(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(exports.resources_get_resource(requestJson) >>> 0)
      },
      resources_set_resource(requestJson) {
        // assembly/index/resources_set_resource(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(exports.resources_set_resource(requestJson) >>> 0)
      },
      resources_delete_resource(requestJson) {
        // assembly/index/resources_delete_resource(~lib/string/String) => ~lib/string/String
        requestJson = __lowerString(requestJson) || __notnull()
        return __liftString(
          exports.resources_delete_resource(requestJson) >>> 0
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
  function __lowerString(value) {
    if (value == null) return 0
    const length = value.length,
      pointer = exports.__new(length << 1, 2) >>> 0,
      memoryU16 = new Uint16Array(memory.buffer)
    for (let i = 0; i < length; ++i)
      memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i)
    return pointer
  }
  function __notnull() {
    throw TypeError('value must not be null')
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
  resources_list_resources,
  resources_get_resource,
  resources_set_resource,
  resources_delete_resource
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
