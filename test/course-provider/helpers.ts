/*
 * Tiny test helpers.  Keeps the dependency
 * footprint minimal — no sinon, no proxyquire — and matches the manual
 * stub pattern used by the other six plugins in the family.
 */

export interface Spy<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any[]) => any = (...args: any[]) => any
> {
  (...args: Parameters<T>): ReturnType<T>
  /** Each call's argument tuple, in invocation order. */
  calls: Parameters<T>[]
  /** Convenience accessor for the most recent call's args. */
  readonly lastCall: Parameters<T> | undefined
  /** True if the spy was called at least once. */
  readonly called: boolean
  /** True if any call's args structurally match the supplied prefix. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calledWith(...args: any[]): boolean
}

/**
 * vi.fn() replacement. Returns a callable that records every invocation.
 * Pass `impl` to delegate the actual return value (otherwise the spy
 * returns `undefined`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function spy<T extends (...args: any[]) => any>(impl?: T): Spy<T> {
  const calls: Parameters<T>[] = []
  const fn = ((...args: Parameters<T>) => {
    calls.push(args)
    return impl ? impl(...args) : (undefined as ReturnType<T>)
  }) as Spy<T>
  fn.calls = calls
  Object.defineProperty(fn, 'lastCall', {
    get: () => calls[calls.length - 1]
  })
  Object.defineProperty(fn, 'called', {
    get: () => calls.length > 0
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn.calledWith = (...expected: any[]) =>
    calls.some(
      (callArgs) =>
        expected.length <= callArgs.length &&
        expected.every((v, i) => deepEq(v, callArgs[i]))
    )
  return fn
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepEq(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => deepEq(a[k], b[k]))
}

/**
 * vi.mock() replacement for CJS modules. Pre-populates the require
 * cache with a synthetic module so the next `require(specifier)` call
 * (including the transitive one inside the plugin) returns `factoryExports`.
 *
 * Call BEFORE requiring the consumer. Returns a `restore()` function
 * that removes the cached entry; mocha's beforeEach/afterEach can use
 * this to keep mocks scoped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockModule(specifier: string, factoryExports: any): () => void {
  // Try to resolve the real module first; if it isn't installed, fall
  // back to using the bare specifier as the cache key. Either way the
  // require cache entry intercepts the next `require(specifier)` call.
  let resolved: string
  try {
    resolved = require.resolve(specifier)
  } catch {
    resolved = specifier
  }
  const previous = require.cache[resolved]
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: factoryExports,
    children: [],
    paths: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    require: require as any,
    parent: null
  } as unknown as NodeJS.Module
  return () => {
    if (previous) {
      require.cache[resolved] = previous
    } else {
      delete require.cache[resolved]
    }
  }
}

/**
 * vi.resetModules() replacement scoped to a single specifier. Call
 * before each test that needs a fresh plugin closure (per-instance
 * state inside src/index.ts mutates across start/stop cycles).
 */
export function resetModuleCache(specifier: string): void {
  const resolved = require.resolve(specifier)
  delete require.cache[resolved]
}
