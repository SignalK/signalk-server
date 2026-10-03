import { LogEntry } from '@signalk/server-api'
import chai from 'chai'
import { v4 as uuidv4 } from 'uuid'
import { startServer } from './ts-servertestutilities'

chai.should()

const PROVIDER_ID = 'logbooktest'

// Servers started by a test, stopped in afterEach so a failed assertion
// cannot leak one into the next test.
const runningServers: (() => unknown)[] = []

const makeProvider = () => {
  const store: { [id: string]: object } = {}
  let lastQuery: unknown
  return {
    store,
    lastQuery: () => lastQuery,
    methods: {
      listResources: (params: object) => {
        lastQuery = params
        return Promise.resolve(store)
      },
      getResource: (id: string) =>
        store[id]
          ? Promise.resolve(store[id])
          : Promise.reject(new Error(`ENOENT: no log entry ${id}`)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResource: (id: string, value: any) => {
        store[id] = value
        return Promise.resolve()
      },
      deleteResource: (id: string) => {
        delete store[id]
        return Promise.resolve()
      }
    }
  }
}

const startWithProvider = async () => {
  const provider = makeProvider()
  const { server, createWsPromiser, get, put, post, selfPutV1, stop } =
    await startServer()
  server.app.resourcesApi.register(PROVIDER_ID, {
    type: 'logentries',
    methods: provider.methods
  })
  runningServers.push(stop)
  return { provider, createWsPromiser, get, put, post, selfPutV1 }
}

const entry = (overrides: object = {}): LogEntry => ({
  datetime: '2026-01-17T09:01:00.000Z',
  text: 'Genoa furled',
  origin: 'agent',
  category: 'navigation',
  ...overrides
})

describe('Logentries resource type', () => {
  afterEach(async function () {
    await Promise.all(runningServers.splice(0).map((stop) => stop()))
  })

  it('PUT and GET a log entry, emitting a resources.logentries delta', async function () {
    const { createWsPromiser, get, put } = await startWithProvider()
    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    const id = uuidv4()
    let response = await put(`/resources/logentries/${id}`, entry())
    response.status.should.equal(200)

    const resourceDelta = JSON.parse(await wsPromiser.nthMessage(2))
    const { path, value } = resourceDelta.updates[0].values[0]
    path.should.equal(`resources.logentries.${id}`)
    value.should.deep.equal(entry())

    response = await get(`/resources/logentries/${id}`)
    response.status.should.equal(200)
    const stored = (await response.json()) as LogEntry
    stored.should.deep.equal(entry())
  })

  it('rejects a non-UUID resource id', async function () {
    const { put } = await startWithProvider()
    const response = await put('/resources/logentries/not-a-uuid', entry())
    response.status.should.equal(400)
  })

  it('rejects a payload id that differs from the resource id', async function () {
    const { put } = await startWithProvider()
    const response = await put(
      `/resources/logentries/${uuidv4()}`,
      entry({ id: uuidv4() })
    )
    response.status.should.equal(400)
  })

  it('rejects an invalid datetime', async function () {
    const { put } = await startWithProvider()
    const response = await put(
      `/resources/logentries/${uuidv4()}`,
      entry({ datetime: 'not-a-datetime' })
    )
    response.status.should.equal(400)
  })

  it('rejects an impossible calendar datetime', async function () {
    const { put } = await startWithProvider()
    const response = await put(
      `/resources/logentries/${uuidv4()}`,
      entry({ datetime: '2026-02-30T00:00:00Z' })
    )
    response.status.should.equal(400)
  })

  it('rejects an entry without text', async function () {
    const { put } = await startWithProvider()

    const response = await put(`/resources/logentries/${uuidv4()}`, {
      datetime: '2026-01-17T09:01:00.000Z'
    } as object)
    response.status.should.equal(400)
  })

  it('POST creates an entry with a server-generated UUID', async function () {
    const { provider, post } = await startWithProvider()
    const response = await post('/resources/logentries', entry())
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    provider.store[id].should.deep.equal(entry())
  })

  it('defaults datetime to now on create and retains it when a PUT omits it', async function () {
    const { provider, createWsPromiser, post, put } = await startWithProvider()
    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    const response = await post('/resources/logentries', {
      text: 'Reefed main'
    })
    response.status.should.equal(201)
    const { id } = (await response.json()) as { id: string }
    const created = provider.store[id] as LogEntry
    // the server-generated default must be a UTC (Z) instant
    created.datetime!.should.match(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
    )

    await put(`/resources/logentries/${id}`, { text: 'Main reefed twice' })
    const replaced = provider.store[id] as LogEntry
    replaced.datetime!.should.equal(created.datetime)
    replaced.text.should.equal('Main reefed twice')

    const resourceDelta = JSON.parse(await wsPromiser.nthMessage(3))
    const { path, value } = resourceDelta.updates[0].values[0]
    path.should.equal(`resources.logentries.${id}`)
    value.should.deep.equal({
      text: 'Main reefed twice',
      datetime: created.datetime
    })
  })

  it('the delta carries the stored entry, not the request body', async function () {
    const { provider, createWsPromiser, post, put } = await startWithProvider()
    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    // simulate a provider that preserves omitted fields on replace
    const setStored = provider.methods.setResource.bind(provider.methods)
    provider.methods.setResource = (id: string, value: object) =>
      setStored(id, { ...provider.store[id], ...value })

    const response = await post('/resources/logentries', {
      text: 'Anchored in Högsåra cove',
      author: 'alice',
      telemetry: [{ path: 'navigation.state', value: 'anchored' }]
    })
    const { id } = (await response.json()) as { id: string }

    await put(`/resources/logentries/${id}`, { text: 'Weighed anchor' })

    const resourceDelta = JSON.parse(await wsPromiser.nthMessage(3))
    const { value } = resourceDelta.updates[0].values[0]
    value.should.deep.equal(provider.store[id])
    value.author.should.equal('alice')
  })

  it('rejects a POST carrying a payload id', async function () {
    const { post } = await startWithProvider()
    const response = await post(
      '/resources/logentries',
      entry({ id: uuidv4() })
    )
    response.status.should.equal(400)
  })

  it('preserves unknown fields and telemetry pathvalues verbatim', async function () {
    const { provider, put } = await startWithProvider()
    const id = uuidv4()
    const withExtensions = {
      ...entry(),
      'x-test-ext': 'kept',
      telemetry: [
        {
          path: 'navigation.position',
          value: { latitude: 60.1, longitude: 24.9 },
          $source: 'signalk-n2k.CanBus0.160',
          'x-test-member': 'kept'
        },
        {
          path: 'x-testns.reading',
          value: 42
        }
      ]
    }
    const response = await put(`/resources/logentries/${id}`, withExtensions)
    response.status.should.equal(200)
    provider.store[id].should.deep.equal(withExtensions)
  })

  describe('listing', () => {
    it('rejects an unfiltered listing', async function () {
      const { get } = await startWithProvider()
      const response = await get('/resources/logentries')
      response.status.should.equal(400)
      const { message } = (await response.json()) as { message: string }
      message.should.match(/date, from, to or limit/)
    })

    it('rejects an unfiltered listing even with an unknown parameter', async function () {
      const { get } = await startWithProvider()
      const response = await get('/resources/logentries?whatever=x')
      response.status.should.equal(400)
    })

    it('accepts a from/to range and forwards it to the provider', async function () {
      const { provider, get } = await startWithProvider()
      const response = await get(
        '/resources/logentries?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z'
      )
      response.status.should.equal(200)
      ;(provider.lastQuery() as { from: string; to: string }).should.deep.equal(
        {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T23:59:59.999Z'
        }
      )
    })

    it('accepts date, limit and dates=true listings', async function () {
      const { get } = await startWithProvider()
      ;(await get('/resources/logentries?date=2026-01-17')).status.should.equal(
        200
      )
      ;(await get('/resources/logentries?limit=10')).status.should.equal(200)
      ;(await get('/resources/logentries?dates=true')).status.should.equal(200)
    })
  })

  it('v1 api path PUT routes to the resource provider', async function () {
    const { provider, selfPutV1 } = await startWithProvider()
    const id = uuidv4()
    const response = await selfPutV1(`resources.logentries.${id}`, {
      value: entry()
    })
    response.status.should.equal(200)
    provider.store[id].should.deep.equal(entry())
  })

  it('v1 api path PUT distinguishes invalid payloads from provider write failures', async function () {
    const { provider, selfPutV1 } = await startWithProvider()
    provider.methods.setResource = () =>
      Promise.reject(new Error('provider write failed'))

    let response = await selfPutV1(`resources.logentries.${uuidv4()}`, {
      value: entry()
    })
    response.status.should.equal(500)

    response = await selfPutV1(`resources.logentries.${uuidv4()}`, {
      value: { datetime: '2026-01-17T09:01:00.000Z' }
    })
    response.status.should.equal(400)
  })

  it('a read failure while filling datetime fails the write without defaults', async function () {
    const { provider, selfPutV1 } = await startWithProvider()
    provider.methods.getResource = () =>
      Promise.reject(new Error('storage backend unreachable'))

    const response = await selfPutV1(`resources.logentries.${uuidv4()}`, {
      value: { text: 'Should not be stored' }
    })
    response.status.should.equal(500)
    Object.keys(provider.store).should.be.empty
  })

  it('websocket PUT routes to the resource provider', async function () {
    const { provider, createWsPromiser } = await startWithProvider()
    const wsPromiser = createWsPromiser()
    await wsPromiser.nthMessage(1)

    const id = uuidv4()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(wsPromiser as any).ws.send(
      JSON.stringify({
        context: 'vessels.self',
        requestId: 'put-logentry',
        put: { path: `resources.logentries.${id}`, value: entry() }
      })
    )

    let reply: { requestId?: string; statusCode?: number } | undefined
    for (let i = 0; i < 20 && !reply; i++) {
      await (wsPromiser as { nextMsg(): Promise<unknown> }).nextMsg()
      reply = (wsPromiser as { parsedMessages(): { requestId?: string }[] })
        .parsedMessages()
        .find((m) => m.requestId === 'put-logentry')
    }
    if (!reply) {
      throw new Error('websocket PUT reply never arrived')
    }
    reply.statusCode!.should.equal(200)
    provider.store[id].should.deep.equal(entry())
  })
})
