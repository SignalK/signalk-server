async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      sk_handle_message(deltaPtr, deltaLen, version) {
        // assembly/api/sk_handle_message_ffi(usize, usize, i32) => void
        deltaPtr = deltaPtr >>> 0;
        deltaLen = deltaLen >>> 0;
        sk_handle_message(deltaPtr, deltaLen, version);
      },
      sk_set_status(msgPtr, msgLen) {
        // assembly/api/sk_set_status_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0;
        msgLen = msgLen >>> 0;
        sk_set_status(msgPtr, msgLen);
      },
      sk_set_error(msgPtr, msgLen) {
        // assembly/api/sk_set_error_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0;
        msgLen = msgLen >>> 0;
        sk_set_error(msgPtr, msgLen);
      },
      sk_debug(msgPtr, msgLen) {
        // assembly/api/sk_debug_ffi(usize, usize) => void
        msgPtr = msgPtr >>> 0;
        msgLen = msgLen >>> 0;
        sk_debug(msgPtr, msgLen);
      },
      sk_get_self_path(pathPtr, pathLen, bufPtr, bufLen) {
        // assembly/api/sk_get_self_path_ffi(usize, usize, usize, usize) => i32
        pathPtr = pathPtr >>> 0;
        pathLen = pathLen >>> 0;
        bufPtr = bufPtr >>> 0;
        bufLen = bufLen >>> 0;
        return sk_get_self_path(pathPtr, pathLen, bufPtr, bufLen);
      },
      sk_get_path(pathPtr, pathLen, bufPtr, bufLen) {
        // assembly/api/sk_get_path_ffi(usize, usize, usize, usize) => i32
        pathPtr = pathPtr >>> 0;
        pathLen = pathLen >>> 0;
        bufPtr = bufPtr >>> 0;
        bufLen = bufLen >>> 0;
        return sk_get_path(pathPtr, pathLen, bufPtr, bufLen);
      },
      sk_read_config(bufPtr, bufLen) {
        // assembly/api/sk_read_config_ffi(usize, usize) => i32
        bufPtr = bufPtr >>> 0;
        bufLen = bufLen >>> 0;
        return sk_read_config(bufPtr, bufLen);
      },
      sk_save_config(configPtr, configLen) {
        // assembly/api/sk_save_config_ffi(usize, usize) => i32
        configPtr = configPtr >>> 0;
        configLen = configLen >>> 0;
        return sk_save_config(configPtr, configLen);
      },
      sk_has_capability(capPtr, capLen) {
        // assembly/network/sk_has_capability_ffi(usize, usize) => i32
        capPtr = capPtr >>> 0;
        capLen = capLen >>> 0;
        return sk_has_capability(capPtr, capLen);
      },
      sk_register_resource_provider(typePtr, typeLen) {
        // assembly/resources/sk_register_resource_provider_ffi(usize, usize) => i32
        typePtr = typePtr >>> 0;
        typeLen = typeLen >>> 0;
        return sk_register_resource_provider(typePtr, typeLen);
      },
      sk_ble_subscribe_gatt(descPtr, descLen) {
        // assembly/ble/sk_ble_subscribe_gatt_ffi(usize, usize) => i32
        descPtr = descPtr >>> 0;
        descLen = descLen >>> 0;
        return sk_ble_subscribe_gatt(descPtr, descLen);
      },
      sk_ble_gatt_write(handle, uuidPtr, uuidLen, dataPtr, dataLen, withResponse) {
        // assembly/ble/sk_ble_gatt_write_ffi(i32, usize, usize, usize, usize, i32) => i32
        uuidPtr = uuidPtr >>> 0;
        uuidLen = uuidLen >>> 0;
        dataPtr = dataPtr >>> 0;
        dataLen = dataLen >>> 0;
        return sk_ble_gatt_write(handle, uuidPtr, uuidLen, dataPtr, dataLen, withResponse);
      },
    }),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    NotificationState: (values => (
      // assembly/signalk/NotificationState
      values[values.normal = exports["NotificationState.normal"].valueOf()] = "normal",
      values[values.alert = exports["NotificationState.alert"].valueOf()] = "alert",
      values[values.warn = exports["NotificationState.warn"].valueOf()] = "warn",
      values[values.alarm = exports["NotificationState.alarm"].valueOf()] = "alarm",
      values[values.emergency = exports["NotificationState.emergency"].valueOf()] = "emergency",
      values
    ))({}),
    NotificationMethod: (values => (
      // assembly/signalk/NotificationMethod
      values[values.visual = exports["NotificationMethod.visual"].valueOf()] = "visual",
      values[values.sound = exports["NotificationMethod.sound"].valueOf()] = "sound",
      values
    ))({}),
    createSimpleDelta(path, value) {
      // assembly/signalk/createSimpleDelta(~lib/string/String, ~lib/string/String) => assembly/signalk/Delta
      path = __retain(__lowerString(path) || __notnull());
      value = __lowerString(value) || __notnull();
      try {
        return __liftInternref(exports.createSimpleDelta(path, value) >>> 0);
      } finally {
        __release(path);
      }
    },
    emit(delta, skVersion) {
      // assembly/api/emit(assembly/signalk/Delta, i32?) => void
      delta = __lowerInternref(delta) || __notnull();
      exports.__setArgumentsLength(arguments.length);
      exports.emit(delta, skVersion);
    },
    setStatus(message) {
      // assembly/api/setStatus(~lib/string/String) => void
      message = __lowerString(message) || __notnull();
      exports.setStatus(message);
    },
    setError(message) {
      // assembly/api/setError(~lib/string/String) => void
      message = __lowerString(message) || __notnull();
      exports.setError(message);
    },
    debug(message) {
      // assembly/api/debug(~lib/string/String) => void
      message = __lowerString(message) || __notnull();
      exports.debug(message);
    },
    getSelfPath(path) {
      // assembly/api/getSelfPath(~lib/string/String) => ~lib/string/String | null
      path = __lowerString(path) || __notnull();
      return __liftString(exports.getSelfPath(path) >>> 0);
    },
    getPath(path) {
      // assembly/api/getPath(~lib/string/String) => ~lib/string/String | null
      path = __lowerString(path) || __notnull();
      return __liftString(exports.getPath(path) >>> 0);
    },
    readConfig() {
      // assembly/api/readConfig() => ~lib/string/String
      return __liftString(exports.readConfig() >>> 0);
    },
    saveConfig(configJson) {
      // assembly/api/saveConfig(~lib/string/String) => i32
      configJson = __lowerString(configJson) || __notnull();
      return exports.saveConfig(configJson);
    },
    hasNetworkCapability() {
      // assembly/network/hasNetworkCapability() => bool
      return exports.hasNetworkCapability() != 0;
    },
    registerResourceProvider(resourceType) {
      // assembly/resources/registerResourceProvider(~lib/string/String) => bool
      resourceType = __lowerString(resourceType) || __notnull();
      return exports.registerResourceProvider(resourceType) != 0;
    },
    hasResourceProviderCapability() {
      // assembly/resources/hasResourceProviderCapability() => bool
      return exports.hasResourceProviderCapability() != 0;
    },
    bleSubscribeGatt(descriptorJson) {
      // assembly/ble/bleSubscribeGatt(~lib/string/String) => i32
      descriptorJson = __lowerString(descriptorJson) || __notnull();
      return exports.bleSubscribeGatt(descriptorJson);
    },
    bleGattWrite(handle, charUuid, data, withResponse) {
      // assembly/ble/bleGattWrite(i32, ~lib/string/String, ~lib/typedarray/Uint8Array, bool?) => i32
      charUuid = __retain(__lowerString(charUuid) || __notnull());
      data = __lowerTypedArray(Uint8Array, 11, 0, data) || __notnull();
      withResponse = withResponse ? 1 : 0;
      try {
        exports.__setArgumentsLength(arguments.length);
        return exports.bleGattWrite(handle, charUuid, data, withResponse);
      } finally {
        __release(charUuid);
      }
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __lowerString(value) {
    if (value == null) return 0;
    const
      length = value.length,
      pointer = exports.__new(length << 1, 2) >>> 0,
      memoryU16 = new Uint16Array(memory.buffer);
    for (let i = 0; i < length; ++i) memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i);
    return pointer;
  }
  function __lowerTypedArray(constructor, id, align, values) {
    if (values == null) return 0;
    const
      length = values.length,
      buffer = exports.__pin(exports.__new(length << align, 1)) >>> 0,
      header = exports.__new(12, id) >>> 0;
    __setU32(header + 0, buffer);
    __dataview.setUint32(header + 4, buffer, true);
    __dataview.setUint32(header + 8, length << align, true);
    new constructor(memory.buffer, buffer, length).set(values);
    exports.__unpin(buffer);
    return header;
  }
  class Internref extends Number {}
  const registry = new FinalizationRegistry(__release);
  function __liftInternref(pointer) {
    if (!pointer) return null;
    const sentinel = new Internref(__retain(pointer));
    registry.register(sentinel, pointer);
    return sentinel;
  }
  function __lowerInternref(value) {
    if (value == null) return 0;
    if (value instanceof Internref) return value.valueOf();
    throw TypeError("internref expected");
  }
  const refcounts = new Map();
  function __retain(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount) refcounts.set(pointer, refcount + 1);
      else refcounts.set(exports.__pin(pointer), 1);
    }
    return pointer;
  }
  function __release(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount === 1) exports.__unpin(pointer), refcounts.delete(pointer);
      else if (refcount) refcounts.set(pointer, refcount - 1);
      else throw Error(`invalid refcount '${refcount}' for reference '${pointer}'`);
    }
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  let __dataview = new DataView(memory.buffer);
  function __setU32(pointer, value) {
    try {
      __dataview.setUint32(pointer, value, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      __dataview.setUint32(pointer, value, true);
    }
  }
  return adaptedExports;
}
export const {
  memory,
  NotificationState,
  NotificationMethod,
  createSimpleDelta,
  SK_VERSION_V1,
  SK_VERSION_V2,
  emit,
  setStatus,
  setError,
  debug,
  getSelfPath,
  getPath,
  readConfig,
  saveConfig,
  hasNetworkCapability,
  registerResourceProvider,
  hasResourceProviderCapability,
  BLE_ERR_NOT_PERMITTED,
  BLE_ERR_UNAVAILABLE,
  BLE_ERR_INVALID_ARGUMENT,
  BLE_ERR_UNKNOWN_HANDLE,
  BLE_ERR_NOT_CONNECTED,
  bleSubscribeGatt,
  bleGattWrite,
  bleGattClose,
  bleSubscribeAdvertisements,
  bleUnsubscribeAdvertisements,
} = await (async url => instantiate(
  await (async () => {
    const isNodeOrBun = typeof process != "undefined" && process.versions != null && (process.versions.node != null || process.versions.bun != null);
    if (isNodeOrBun) { return globalThis.WebAssembly.compile(await (await import("node:fs/promises")).readFile(url)); }
    else { return await globalThis.WebAssembly.compileStreaming(globalThis.fetch(url)); }
  })(), {
  }
))(new URL("plugin.wasm", import.meta.url));
