/**
 * Bluetooth Low Energy API for AssemblyScript plugins
 *
 * Uses the server-managed BLE API. Requires the 'bluetooth' capability in
 * the plugin manifest.
 *
 * Calls return immediately. Connection changes, notifications,
 * advertisements and asynchronous failures arrive as JSON events through
 * the plugin's exported `ble_handler(eventJson: string): void` function.
 * Negative return values are error codes (see the BLE_ERR_* constants).
 */

export const BLE_ERR_NOT_PERMITTED: i32 = -1
export const BLE_ERR_UNAVAILABLE: i32 = -2
export const BLE_ERR_INVALID_ARGUMENT: i32 = -3
export const BLE_ERR_UNKNOWN_HANDLE: i32 = -4
export const BLE_ERR_NOT_CONNECTED: i32 = -5

// ===== FFI Declarations =====

/** @internal */
@external("env", "sk_ble_subscribe_gatt")
declare function sk_ble_subscribe_gatt_ffi(descPtr: usize, descLen: usize): i32

/** @internal */
@external("env", "sk_ble_gatt_write")
declare function sk_ble_gatt_write_ffi(
  handle: i32,
  uuidPtr: usize,
  uuidLen: usize,
  dataPtr: usize,
  dataLen: usize,
  withResponse: i32
): i32

/** @internal */
@external("env", "sk_ble_gatt_close")
declare function sk_ble_gatt_close_ffi(handle: i32): i32

/** @internal */
@external("env", "sk_ble_subscribe_advertisements")
declare function sk_ble_subscribe_advertisements_ffi(): i32

/** @internal */
@external("env", "sk_ble_unsubscribe_advertisements")
declare function sk_ble_unsubscribe_advertisements_ffi(): i32

// ===== Public API Functions =====

/**
 * Subscribe to GATT notifications of a device.
 *
 * @param descriptorJson A GATTSubscriptionDescriptor as JSON
 * @returns A positive subscription handle, or a negative BLE_ERR_* code
 */
export function bleSubscribeGatt(descriptorJson: string): i32 {
  const buffer = String.UTF8.encode(descriptorJson)
  return sk_ble_subscribe_gatt_ffi(changetype<usize>(buffer), buffer.byteLength)
}

/**
 * Write bytes to a characteristic of a subscribed, connected device.
 *
 * @returns 0 when the write was issued, or a negative BLE_ERR_* code
 */
export function bleGattWrite(
  handle: i32,
  charUuid: string,
  data: Uint8Array,
  withResponse: bool = false
): i32 {
  const uuid = String.UTF8.encode(charUuid)
  return sk_ble_gatt_write_ffi(
    handle,
    changetype<usize>(uuid),
    uuid.byteLength,
    data.dataStart,
    data.byteLength,
    withResponse ? 1 : 0
  )
}

/**
 * Close a GATT subscription and release the device.
 *
 * @returns 0, or a negative BLE_ERR_* code
 */
export function bleGattClose(handle: i32): i32 {
  return sk_ble_gatt_close_ffi(handle)
}

/**
 * Receive every BLE advertisement the server sees as events.
 *
 * @returns 0, or a negative BLE_ERR_* code
 */
export function bleSubscribeAdvertisements(): i32 {
  return sk_ble_subscribe_advertisements_ffi()
}

/**
 * Stop receiving BLE advertisements.
 */
export function bleUnsubscribeAdvertisements(): i32 {
  return sk_ble_unsubscribe_advertisements_ffi()
}
