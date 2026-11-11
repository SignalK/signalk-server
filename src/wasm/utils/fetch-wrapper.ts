/**
 * Fetch Wrapper for WASM Network Capability
 *
 * Provides a Node.js fetch wrapper that handles various header formats
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:fetch')

let cachedFetch: typeof fetch | null = null

/**
 * Get a properly wrapped fetch function for use with as-fetch
 */
export function getNodeFetch(): typeof fetch {
  if (cachedFetch) {
    return cachedFetch
  }

  try {
    // Try to use native Node.js fetch (Node 18+)
    const nativeFetch = globalThis.fetch
    if (!nativeFetch) {
      throw new Error('Native fetch not available')
    }

    // Wrap native fetch to handle headers properly for as-fetch
    cachedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const sanitizedInit = init ? { ...init } : {}

      // Ensure headers are in a format Node.js fetch accepts
      if (sanitizedInit.headers) {
        const headers = sanitizedInit.headers

        if (
          typeof headers === 'object' &&
          !Array.isArray(headers) &&
          !(headers instanceof Headers)
        ) {
          if (
            Object.getPrototypeOf(headers) === Object.prototype ||
            Object.getPrototypeOf(headers) === null
          ) {
            sanitizedInit.headers = headers as Record<string, string>
          } else {
            const headersObj: Record<string, string> = {}
            try {
              for (const [key, value] of Object.entries(headers)) {
                headersObj[key] = String(value)
              }
              sanitizedInit.headers = headersObj
            } catch (err) {
              debug('Error converting headers:', err)
              sanitizedInit.headers = {}
            }
          }
        } else if (Array.isArray(headers)) {
          const headersObj: Record<string, string> = {}
          for (const [key, value] of headers) {
            headersObj[key] = value
          }
          sanitizedInit.headers = headersObj
        } else if (headers instanceof Headers) {
          const headersObj: Record<string, string> = {}
          headers.forEach((value, key) => {
            headersObj[key] = value
          })
          sanitizedInit.headers = headersObj
        } else {
          sanitizedInit.headers = {}
        }
      } else {
        sanitizedInit.headers = {}
      }

      return nativeFetch(input, sanitizedInit)
    }

    return cachedFetch
  } catch {
    debug(
      'Warning: Native fetch not available, network capability will be limited'
    )
    cachedFetch = async () => {
      throw new Error(
        'Fetch not available - Node.js 18+ required for network capability'
      )
    }
    return cachedFetch
  }
}

/** Status reported for a request that got no HTTP response */
export const FAILED_REQUEST_STATUS = 502

/** The parts of a response as-fetch reads */
export type AsFetchResponse = Pick<
  Response,
  'status' | 'redirected' | 'arrayBuffer'
>

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Wrap a fetch implementation for as-fetch so that it never rejects.
 *
 * as-fetch resumes a plugin paused in `fetchSync`, and calls the plugin's
 * response handler, only when the request and its body read succeed. A DNS
 * or connection error, or a body cut off mid-transfer, would leave the
 * plugin suspended for good, and a plugin suspended in `plugin_start` holds
 * the start of every network plugin queued behind it. Such failures are
 * answered with an empty body and FAILED_REQUEST_STATUS instead.
 */
export function resolveFailedRequests<A extends unknown[]>(
  fetchImpl: (...args: A) => Promise<Response>
): (...args: A) => Promise<AsFetchResponse> {
  return async (...args) => {
    try {
      const response = await fetchImpl(...args)
      return {
        status: response.status,
        redirected: response.redirected,
        arrayBuffer: () =>
          response.arrayBuffer().catch((error: unknown) => {
            debug(`Reading response body failed: ${errorMessage(error)}`)
            return new ArrayBuffer(0)
          })
      }
    } catch (error) {
      debug(`Request failed: ${errorMessage(error)}`)
      return {
        status: FAILED_REQUEST_STATUS,
        redirected: false,
        arrayBuffer: async () => new ArrayBuffer(0)
      }
    }
  }
}
