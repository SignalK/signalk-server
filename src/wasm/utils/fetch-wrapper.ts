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
