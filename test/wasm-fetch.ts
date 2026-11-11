import { expect } from 'chai'
import { resolveFailedRequests } from '../src/wasm/utils/fetch-wrapper'

const ASYNCIFY_NORMAL = 0
const ASYNCIFY_UNWINDING = 1
const RESUME_TIMEOUT_MS = 2000

interface FetchHandlerImports {
  'as-fetch': {
    _fetchGETSync: (url: string, mode: number, headers: string[][]) => unknown
    _fetchGET: (
      url: string,
      mode: number,
      headers: string[][],
      callbackId: number
    ) => void
  }
}

interface FetchHandlerInstance {
  imports: FetchHandlerImports
  init: (exports: unknown, entry: () => void) => void
}

// Stands in for a plugin paused in fetchSync: as-fetch unwinds it, then
// rewinds it and calls the entry function once the response is in.
function fakeAsyncifyExports() {
  const memory = new WebAssembly.Memory({ initial: 1 })
  const calls: string[] = []
  let state = ASYNCIFY_NORMAL
  return {
    calls,
    exports: {
      memory,
      asyncify_get_state: () => state,
      asyncify_start_unwind: () => {
        calls.push('unwind')
        state = ASYNCIFY_UNWINDING
      },
      asyncify_stop_unwind: () => {
        state = ASYNCIFY_NORMAL
      },
      asyncify_start_rewind: () => calls.push('rewind'),
      __new: () => 0,
      responseHandler: (
        body: ArrayBuffer,
        status: number,
        _redirected: boolean,
        callbackId: number
      ) => calls.push(`response ${callbackId} ${status} ${body.byteLength}`)
    }
  }
}

async function createHandler(
  fetchImpl: (url: string) => Promise<unknown>
): Promise<FetchHandlerInstance> {
  const { FetchHandler } = await import('as-fetch/bindings.raw.esm.js')
  return new FetchHandler(fetchImpl) as unknown as FetchHandlerInstance
}

const waitFor = (condition: () => boolean) =>
  new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + RESUME_TIMEOUT_MS
    const poll = () => {
      if (condition()) return resolve()
      if (Date.now() > deadline) return reject(new Error('never resumed'))
      setTimeout(poll, 5)
    }
    poll()
  })

describe('WASM network requests', () => {
  const unreachable = resolveFailedRequests(async () => {
    throw new TypeError('fetch failed')
  })

  it('resumes a plugin whose request fails without a response', async () => {
    const handler = await createHandler(unreachable)
    const fake = fakeAsyncifyExports()
    let resumed = false
    handler.init(fake.exports, () => {
      resumed = true
    })

    handler.imports['as-fetch']._fetchGETSync(
      'http://unreachable.invalid',
      1,
      []
    )

    await waitFor(() => resumed)
    expect(fake.calls).to.deep.equal(['unwind', 'rewind'])
  })

  it('answers a failed asynchronous request with an empty failure', async () => {
    const handler = await createHandler(unreachable)
    const fake = fakeAsyncifyExports()
    handler.init(fake.exports, () => {})

    handler.imports['as-fetch']._fetchGET(
      'http://unreachable.invalid',
      1,
      [],
      7
    )

    await waitFor(() => fake.calls.length > 0)
    expect(fake.calls).to.deep.equal(['response 7 502 0'])
  })

  const unreadableBody = resolveFailedRequests(
    async () =>
      ({
        status: 200,
        redirected: false,
        arrayBuffer: () => Promise.reject(new TypeError('terminated'))
      }) as unknown as Response
  )

  it('resumes a plugin whose response body cannot be read', async () => {
    const handler = await createHandler(unreadableBody)
    const fake = fakeAsyncifyExports()
    let resumed = false
    handler.init(fake.exports, () => {
      resumed = true
    })

    handler.imports['as-fetch']._fetchGETSync('http://example.invalid', 1, [])

    await waitFor(() => resumed)
  })

  it('answers an unreadable asynchronous response with an empty body', async () => {
    const handler = await createHandler(unreadableBody)
    const fake = fakeAsyncifyExports()
    handler.init(fake.exports, () => {})

    handler.imports['as-fetch']._fetchGET('http://example.invalid', 1, [], 5)

    await waitFor(() => fake.calls.length > 0)
    expect(fake.calls).to.deep.equal(['response 5 200 0'])
  })

  it('passes a successful response through', async () => {
    const body = new TextEncoder().encode('{"ok":true}')
    const handler = await createHandler(
      resolveFailedRequests(async () => new Response(body, { status: 201 }))
    )
    const fake = fakeAsyncifyExports()
    handler.init(fake.exports, () => {})

    handler.imports['as-fetch']._fetchGET('http://example.invalid', 1, [], 3)

    await waitFor(() => fake.calls.length > 0)
    expect(fake.calls).to.deep.equal([`response 3 201 ${body.byteLength}`])
  })
})
