/** Exported memory */
export declare const memory: WebAssembly.Memory;
// Exported runtime interface
export declare function __new(size: number, id: number): number;
export declare function __pin(ptr: number): number;
export declare function __unpin(ptr: number): void;
export declare function __collect(): void;
export declare const __rtti_base: number;
/**
 * assembly/index/plugin_id
 * @returns `~lib/string/String`
 */
export declare function plugin_id(): string;
/**
 * assembly/index/plugin_name
 * @returns `~lib/string/String`
 */
export declare function plugin_name(): string;
/**
 * assembly/index/plugin_schema
 * @returns `~lib/string/String`
 */
export declare function plugin_schema(): string;
/**
 * assembly/index/plugin_start
 * @param configPtr `usize`
 * @param configLen `usize`
 * @returns `i32`
 */
export declare function plugin_start(configPtr: number, configLen: number): number;
/**
 * assembly/index/plugin_stop
 * @returns `i32`
 */
export declare function plugin_stop(): number;
/**
 * assembly/index/resource_list
 * @param queryJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function resource_list(queryJson: string): string;
/**
 * assembly/index/resource_get
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function resource_get(requestJson: string): string;
/**
 * assembly/index/resource_set
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function resource_set(requestJson: string): string;
/**
 * assembly/index/resource_delete
 * @param requestJson `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function resource_delete(requestJson: string): string;
