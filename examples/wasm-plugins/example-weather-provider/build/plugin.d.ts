/** Exported memory */
export declare const memory: WebAssembly.Memory
// Exported runtime interface
export declare function __new(size: number, id: number): number
export declare function __pin(ptr: number): number
export declare function __unpin(ptr: number): void
export declare function __collect(): void
export declare const __rtti_base: number
/**
 * assembly/index/plugin_name
 * @returns `~lib/string/String`
 */
export declare function plugin_name(): string
/**
 * assembly/index/plugin_schema
 * @returns `~lib/string/String`
 */
export declare function plugin_schema(): string
/**
 * assembly/index/plugin_start
 * @param configPtr `usize`
 * @param configLen `usize`
 * @returns `i32`
 */
export declare function plugin_start(
  configPtr: number,
  configLen: number
): number
/**
 * assembly/index/plugin_stop
 * @returns `i32`
 */
export declare function plugin_stop(): number
/**
 * assembly/index/weather_get_observations
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function weather_get_observations(requestJson: string): string
/**
 * assembly/index/weather_get_forecasts
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function weather_get_forecasts(requestJson: string): string
/**
 * assembly/index/weather_get_warnings
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function weather_get_warnings(requestJson: string): string
