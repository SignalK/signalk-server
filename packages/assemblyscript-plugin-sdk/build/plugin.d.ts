/** Exported memory */
export declare const memory: WebAssembly.Memory;
/** assembly/signalk/NotificationState */
export declare enum NotificationState {
  /** @type `i32` */
  normal,
  /** @type `i32` */
  alert,
  /** @type `i32` */
  warn,
  /** @type `i32` */
  alarm,
  /** @type `i32` */
  emergency,
}
/** assembly/signalk/NotificationMethod */
export declare enum NotificationMethod {
  /** @type `i32` */
  visual,
  /** @type `i32` */
  sound,
}
/**
 * assembly/signalk/createSimpleDelta
 * @param path `~lib/string/String`
 * @param value `~lib/string/String`
 * @returns `assembly/signalk/Delta`
 */
export declare function createSimpleDelta(path: string, value: string): __Internref4;
/** assembly/api/SK_VERSION_V1 */
export declare const SK_VERSION_V1: {
  /** @type `i32` */
  get value(): number
};
/** assembly/api/SK_VERSION_V2 */
export declare const SK_VERSION_V2: {
  /** @type `i32` */
  get value(): number
};
/**
 * assembly/api/emit
 * @param delta `assembly/signalk/Delta`
 * @param skVersion `i32`
 */
export declare function emit(delta: __Internref4, skVersion?: number): void;
/**
 * assembly/api/setStatus
 * @param message `~lib/string/String`
 */
export declare function setStatus(message: string): void;
/**
 * assembly/api/setError
 * @param message `~lib/string/String`
 */
export declare function setError(message: string): void;
/**
 * assembly/api/debug
 * @param message `~lib/string/String`
 */
export declare function debug(message: string): void;
/**
 * assembly/api/getSelfPath
 * @param path `~lib/string/String`
 * @returns `~lib/string/String | null`
 */
export declare function getSelfPath(path: string): string | null;
/**
 * assembly/api/getPath
 * @param path `~lib/string/String`
 * @returns `~lib/string/String | null`
 */
export declare function getPath(path: string): string | null;
/**
 * assembly/api/readConfig
 * @returns `~lib/string/String`
 */
export declare function readConfig(): string;
/**
 * assembly/api/saveConfig
 * @param configJson `~lib/string/String`
 * @returns `i32`
 */
export declare function saveConfig(configJson: string): number;
/**
 * assembly/network/hasNetworkCapability
 * @returns `bool`
 */
export declare function hasNetworkCapability(): boolean;
/**
 * assembly/resources/registerResourceProvider
 * @param resourceType `~lib/string/String`
 * @returns `bool`
 */
export declare function registerResourceProvider(resourceType: string): boolean;
/**
 * assembly/resources/hasResourceProviderCapability
 * @returns `bool`
 */
export declare function hasResourceProviderCapability(): boolean;
/** assembly/ble/BLE_ERR_NOT_PERMITTED */
export declare const BLE_ERR_NOT_PERMITTED: {
  /** @type `i32` */
  get value(): number
};
/** assembly/ble/BLE_ERR_UNAVAILABLE */
export declare const BLE_ERR_UNAVAILABLE: {
  /** @type `i32` */
  get value(): number
};
/** assembly/ble/BLE_ERR_INVALID_ARGUMENT */
export declare const BLE_ERR_INVALID_ARGUMENT: {
  /** @type `i32` */
  get value(): number
};
/** assembly/ble/BLE_ERR_UNKNOWN_HANDLE */
export declare const BLE_ERR_UNKNOWN_HANDLE: {
  /** @type `i32` */
  get value(): number
};
/** assembly/ble/BLE_ERR_NOT_CONNECTED */
export declare const BLE_ERR_NOT_CONNECTED: {
  /** @type `i32` */
  get value(): number
};
/**
 * assembly/ble/bleSubscribeGatt
 * @param descriptorJson `~lib/string/String`
 * @returns `i32`
 */
export declare function bleSubscribeGatt(descriptorJson: string): number;
/**
 * assembly/ble/bleGattWrite
 * @param handle `i32`
 * @param charUuid `~lib/string/String`
 * @param data `~lib/typedarray/Uint8Array`
 * @param withResponse `bool`
 * @returns `i32`
 */
export declare function bleGattWrite(handle: number, charUuid: string, data: Uint8Array, withResponse?: boolean): number;
/**
 * assembly/ble/bleGattClose
 * @param handle `i32`
 * @returns `i32`
 */
export declare function bleGattClose(handle: number): number;
/**
 * assembly/ble/bleSubscribeAdvertisements
 * @returns `i32`
 */
export declare function bleSubscribeAdvertisements(): number;
/**
 * assembly/ble/bleUnsubscribeAdvertisements
 * @returns `i32`
 */
export declare function bleUnsubscribeAdvertisements(): number;
/** assembly/signalk/Delta */
declare class __Internref4 extends Number {
  private __nominal4: symbol;
  private __nominal0: symbol;
}
