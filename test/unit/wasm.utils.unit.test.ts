import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const loadFetchWrapper = () => {
  const modulePath = require.resolve('../../src/wasm/utils/fetch-wrapper')
  delete require.cache[modulePath]
  return require('../../src/wasm/utils/fetch-wrapper') as {
    getNodeFetch: () => typeof fetch
  }
}

const loadFormatDetection = () => {
  const modulePath = require.resolve('../../src/wasm/utils/format-detection')
  delete require.cache[modulePath]
  return require('../../src/wasm/utils/format-detection') as {
    detectWasmFormat: (buffer: Buffer) => string
  }
}

describe('wasm utils', () => {
  it('detects wasm formats', () => {
    const { detectWasmFormat } = loadFormatDetection()

    expect(detectWasmFormat(Buffer.alloc(4))).to.equal('unknown')
    expect(
      detectWasmFormat(
        Buffer.from([0x01, 0x02, 0x03, 0x04, 0x01, 0x00, 0x00, 0x00])
      )
    ).to.equal('unknown')
    expect(
      detectWasmFormat(
        Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
      )
    ).to.equal('wasi-p1')
    expect(
      detectWasmFormat(
        Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x02, 0x00, 0x00, 0x00])
      )
    ).to.equal('unknown')
  })

  it('wraps fetch and normalizes headers', async () => {
    const fetchCalls: Array<{ headers: Record<string, string> }> = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      fetchCalls.push({
        headers: (init?.headers || {}) as Record<string, string>
      })
      return { ok: true } as Response
    }) as typeof fetch

    try {
      const { getNodeFetch } = loadFetchWrapper()
      const wrapped = getNodeFetch()

      await wrapped('http://example.com', { headers: { a: 'b' } })
      const cached = getNodeFetch()
      expect(cached).to.equal(wrapped)

      await wrapped('http://example.com', { headers: [['c', 'd']] })
      await wrapped('http://example.com', { headers: new Headers({ e: 'f' }) })
      await wrapped('http://example.com', { headers: 42 as unknown as Headers })

      const trickyHeaders = Object.create({})
      Object.defineProperty(trickyHeaders, 'boom', {
        get: () => {
          throw new Error('boom')
        }
      })
      await wrapped('http://example.com', { headers: trickyHeaders })

      expect(fetchCalls[0].headers).to.deep.equal({ a: 'b' })
      expect(fetchCalls[1].headers).to.deep.equal({ c: 'd' })
      expect(fetchCalls[2].headers).to.deep.equal({ e: 'f' })
      expect(fetchCalls[3].headers).to.deep.equal({})
      expect(fetchCalls[4].headers).to.deep.equal({})
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws when native fetch is unavailable', async () => {
    const originalFetch = globalThis.fetch
    delete (globalThis as { fetch?: typeof fetch }).fetch

    try {
      const { getNodeFetch } = loadFetchWrapper()
      const wrapped = getNodeFetch()

      try {
        await wrapped('http://example.com')
        throw new Error('expected fetch to throw')
      } catch (error) {
        expect((error as Error).message).to.contain('Fetch not available')
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
