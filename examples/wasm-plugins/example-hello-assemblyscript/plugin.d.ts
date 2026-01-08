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
 * assembly/index/poll
 * @returns `i32`
 */
export declare function poll(): number
/**
 * assembly/index/http_endpoints
 * @returns `~lib/string/String`
 */
export declare function http_endpoints(): string
/**
 * assembly/index/handle_get_info
 * @param requestPtr `usize`
 * @param requestLen `usize`
 * @returns `~lib/string/String`
 */
export declare function handle_get_info(
  requestPtr: number,
  requestLen: number
): string
/**
 * assembly/index/handle_get_status
 * @param requestPtr `usize`
 * @param requestLen `usize`
 * @returns `~lib/string/String`
 */
export declare function handle_get_status(
  requestPtr: number,
  requestLen: number
): string
