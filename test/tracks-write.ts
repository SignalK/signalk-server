import { expect } from 'chai'
import express from 'express'
import type { Server } from 'node:http'
import { TrackApiHttpRegistry } from '../dist/api/tracks/index.js'
import type { Context } from '@signalk/server-api'

/**
 * Writing tracks.
 *
 * A track someone uploads is a track like any recorded one — that is the whole
 * point of it living here rather than in `resources/routes` — so the same
 * registry serves both. What differs is that a write must land on one definite
 * provider rather than fanning out, that not every provider can store, and that
 * it needs the same authority as writing any other data.
 */
describe('Track API writes', () => {
  let server: Server | undefined
  let base = ''
  let stored: unknown[] = []
  let authorisedFor: string[] = []

  const feature = (id: string, context?: string) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: [[[24.9, 60.1] as [number, number]]]
    },
    properties: {
      id,
      ...(context ? { context } : {}),
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-02T00:00:00Z',
      pointCount: 1
    }
  })

  /** A provider that stores, one that cannot, and one that deletes. */
  const writingProvider = () => ({
    getTracks: () =>
      Promise.resolve({ type: 'FeatureCollection' as const, features: [] }),
    getTrackContexts: () => Promise.resolve([] as Context[]),
    storeTrack: (track: unknown) => {
      stored.push(track)
      return Promise.resolve(feature('imported:generated-id'))
    },
    deleteTrack: (id: string) => Promise.resolve(id === 'imported:known'),
    getTrack: (id: string) =>
      Promise.resolve(
        id === 'imported:known'
          ? feature(id, 'vessels.urn:mrn:imo:mmsi:987654321')
          : undefined
      )
  })

  const readOnlyProvider = () => ({
    getTracks: () =>
      Promise.resolve({ type: 'FeatureCollection' as const, features: [] }),
    getTrackContexts: () => Promise.resolve([] as Context[])
  })

  const serve = async (
    provider: unknown = writingProvider(),
    allowWrite = true,
    allowAdmin = true
  ) => {
    stored = []
    authorisedFor = []
    const app = express()
    app.use(express.json())
    // securityStrategy is always present on a real server -- startSecurity
    // installs a dummy one when security is disabled -- so the stub supplies
    // it rather than the route guarding against its absence.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(app as any).securityStrategy = {
      shouldAllowPut: (_req: unknown, context: string) => {
        authorisedFor.push(context)
        return allowWrite
      },
      // Security active, so deletion consults allowConfigure rather than
      // falling back to the write check.
      isDummy: () => false,
      allowConfigure: () => allowAdmin
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = new TrackApiHttpRegistry(app as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.registerTrackApiProvider('testprovider', provider as any)
    await registry.start()
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const address = server?.address()
    base =
      typeof address === 'object' && address
        ? `http://localhost:${address.port}`
        : ''
  }

  const post = (body: unknown, path = '/signalk/v2/api/tracks') =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

  const validTrack = {
    coordinates: [[[24.9, 60.1]]],
    coordTimes: [['2026-08-01T00:00:00Z']],
    name: 'Crossing to Gotland'
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
      } else {
        resolve()
      }
    })
    server = undefined
  })

  it('stores a track and returns it with the id the provider assigned', async () => {
    await serve()
    const res = await post(validTrack)
    expect(res.status).to.equal(201)
    const body = (await res.json()) as {
      properties: { id: string; providerId?: string }
    }

    // The id comes from the provider, not the client: two clients importing
    // the same file must not collide, and an import must not be able to name
    // an existing track.
    expect(body.properties.id).to.equal('imported:generated-id')
    expect(body.properties.providerId).to.equal('testprovider')
  })

  it('passes the track through to the provider', async () => {
    await serve()
    await post(validTrack)

    expect(stored).to.have.length(1)
    expect(stored[0]).to.deep.include({ name: 'Crossing to Gotland' })
  })

  it('refuses a write without authority', async () => {
    await serve(writingProvider(), false)
    const res = await post(validTrack)

    expect(res.status).to.equal(403)
  })

  it('reports a provider that cannot store as not implemented', async () => {
    // A recorder with nowhere to put an imported track is a legitimate
    // provider, not a broken one, so this is 501 rather than an error.
    await serve(readOnlyProvider())
    const res = await post(validTrack)

    expect(res.status).to.equal(501)
  })

  it('rejects coordinates that are not positions', async () => {
    await serve()
    const res = await post({ coordinates: [[[24.9]]] })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/longitude, latitude/)
  })

  it('rejects coordinates out of range', async () => {
    await serve()
    const res = await post({ coordinates: [[[181, 60.1]]] })

    expect(res.status).to.equal(400)
  })

  it('rejects times that do not line up with the positions they date', async () => {
    // The nesting has to match exactly, or a client cannot tell which time
    // belongs to which point and neither can the provider.
    await serve()
    const res = await post({
      coordinates: [
        [
          [24.9, 60.1],
          [25.0, 60.2]
        ]
      ],
      coordTimes: [['2026-08-01T00:00:00Z']]
    })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/one time per position/)
  })

  it('accepts a track whose points carry no times', async () => {
    // A GPX without <time> is still a track -- a shape someone sailed. What it
    // cannot do is answer a time window query, which is why from and to are
    // optional rather than invented.
    await serve()
    const res = await post({ coordinates: [[[24.9, 60.1]]], name: 'No times' })

    expect(res.status).to.equal(201)
    expect(stored[0]).to.not.have.property('coordTimes')
  })

  it('rejects a date where a timestamp belongs', async () => {
    // Date.parse would read '2026-08-01' as midnight UTC and let a client turn
    // dates into instants without knowing it.
    await serve()
    const res = await post({
      coordinates: [[[24.9, 60.1]]],
      coordTimes: [['2026-08-01']]
    })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/ISO 8601 time/)
  })

  it('rejects a blank context rather than storing an association to nothing', async () => {
    await serve()
    const res = await post({ coordinates: [[[24.9, 60.1]]], context: '  ' })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/non-empty/)
  })

  // Authorisation has to be about the vessel the track claims, not about the
  // uploader. Checking `vessels.self` for every import would let anyone
  // permitted to write their own vessel file a track under another's name.
  it('authorises an import against the context it declares', async () => {
    await serve()
    await post({
      coordinates: [[[24.9, 60.1]]],
      context: 'vessels.urn:mrn:imo:mmsi:987654321'
    })

    expect(authorisedFor).to.deep.equal(['vessels.urn:mrn:imo:mmsi:987654321'])
  })

  it('authorises a contextless import as own-vessel data', async () => {
    // Nothing else it could belong to: it is the uploader's to keep.
    await serve()
    await post({ coordinates: [[[24.9, 60.1]]] })

    expect(authorisedFor).to.deep.equal(['vessels.self'])
  })

  it('qualifies a bare context so the track stays reachable', async () => {
    // Stored bare, a later ?context=123456789 would ask for vessels.123456789
    // and never match what was written.
    await serve()
    await post({ coordinates: [[[24.9, 60.1]]], context: '123456789' })

    expect(stored[0]).to.deep.include({ context: 'vessels.123456789' })
  })

  // The only way to reach a track that has neither times nor a context: a
  // window query needs the first, a context query the second.
  it('fetches a track by id', async () => {
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:known`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as {
      properties: { id: string; providerId?: string }
    }

    expect(body.properties.id).to.equal('imported:known')
    expect(body.properties.providerId).to.equal('testprovider')
  })

  it('reports an unknown id as not found', async () => {
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:missing`)

    expect(res.status).to.equal(404)
  })

  it('does not let the id route shadow the contexts listing', async () => {
    // /contexts and /_providers are single segments under the same prefix, so
    // a wildcard registered before them would swallow both.
    await serve()
    const contexts = await fetch(
      `${base}/signalk/v2/api/tracks/contexts?duration=PT1H`
    )
    const providers = await fetch(`${base}/signalk/v2/api/tracks/_providers`)

    expect(contexts.status).to.equal(200)
    expect(providers.status).to.equal(200)
  })

  it('rejects an unknown property rather than silently dropping it', async () => {
    // A misspelled coordTimes would otherwise return 201 and lose the times
    // the client believed it had stored.
    await serve()
    const res = await post({
      coordinates: [[[24.9, 60.1]]],
      coordtimes: [['2026-08-01T00:00:00Z']]
    })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/unknown property: coordtimes/)
  })

  // At the parser rather than over HTTP: a payload big enough to trip the cap
  // is also big enough to trip express's body limit, which answers 413 first.
  // The cap still matters -- a provider reached another way, or a raised body
  // limit, has a stated bound -- but HTTP is not where it can be observed.
  it('refuses an import with more segments than the cap allows', async () => {
    const { parseTrackImport } = await import('../dist/api/tracks/query.js')
    const segment = [[24.9, 60.1]]
    const { errors } = parseTrackImport({
      coordinates: Array.from({ length: 10_001 }, () => segment)
    })

    expect(errors[0]).to.match(/at most 10000 segments/)
  })

  it('refuses an import with more points than the cap allows', async () => {
    const { parseTrackImport } = await import('../dist/api/tracks/query.js')
    const segment = Array.from({ length: 1_000 }, () => [24.9, 60.1])
    const { errors } = parseTrackImport({
      coordinates: Array.from({ length: 1_001 }, () => segment)
    })

    expect(errors[0]).to.match(/at most 1000000 points/)
  })

  it('does not report one problem per bad position', async () => {
    // Every invalid position would otherwise add a message, and the route
    // joins them into the body -- an import at the point cap could answer a
    // 400 of several megabytes.
    const { parseTrackImport } = await import('../dist/api/tracks/query.js')
    const { errors } = parseTrackImport({
      coordinates: [Array.from({ length: 500 }, () => [999, 999])]
    })

    expect(errors).to.have.length(21)
    expect(errors[20]).to.match(/further problems/)
  })

  it('reports a provider refusing the track as a client error', async () => {
    // "This track cannot be kept here" is not "the store broke": a provider
    // that only keeps timed tracks refusing an untimed one is a 400.
    const { TrackRejectedError } =
      await import('../packages/server-api/dist/tracks.js')
    await serve({
      getTracks: () =>
        Promise.resolve({ type: 'FeatureCollection' as const, features: [] }),
      getTrackContexts: () => Promise.resolve([] as Context[]),
      storeTrack: () =>
        Promise.reject(
          new TrackRejectedError('this store keeps timed tracks only')
        )
    })
    const res = await post({ coordinates: [[[24.9, 60.1]]] })
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/timed tracks only/)
  })

  it('reports reading by id as unsupported when no provider can', async () => {
    // Not a 404: the track is not absent, the server simply has nothing
    // registered that can look one up by id.
    await serve(readOnlyProvider())
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:known`)

    expect(res.status).to.equal(501)
  })

  it('says where a created track lives', async () => {
    await serve()
    const res = await post(validTrack)

    expect(res.headers.get('location')).to.equal(
      '/signalk/v2/api/tracks/imported%3Agenerated-id'
    )
  })

  it('deletes a track by id', async () => {
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:known`, {
      method: 'DELETE'
    })

    expect(res.status).to.equal(200)
  })

  it('reports deleting an unknown id as not found', async () => {
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:missing`, {
      method: 'DELETE'
    })

    expect(res.status).to.equal(404)
  })

  it('refuses a delete without authority', async () => {
    await serve(writingProvider(), false, false)
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:known`, {
      method: 'DELETE'
    })

    expect(res.status).to.equal(403)
  })

  // An imported track records no uploader, so there is no owner to check a
  // requester against -- which would otherwise let anyone with own-vessel
  // write permission delete a track someone else brought aboard.
  // A provider may delete without being able to read back, and registering a
  // readable provider alongside it must not make it unreachable.
  it('deletes through a delete-only provider when another can read', async () => {
    let deleted: string | undefined
    const app = express()
    app.use(express.json())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(app as any).securityStrategy = {
      shouldAllowPut: () => true,
      isDummy: () => false,
      allowConfigure: () => true
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = new TrackApiHttpRegistry(app as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.registerTrackApiProvider('reader', readOnlyProvider() as any)
    registry.registerTrackApiProvider('remover', {
      getTracks: () =>
        Promise.resolve({ type: 'FeatureCollection' as const, features: [] }),
      getTrackContexts: () => Promise.resolve([] as Context[]),
      deleteTrack: (id: string) => {
        deleted = id
        return Promise.resolve(true)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await registry.start()
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const address = server?.address()
    const url =
      typeof address === 'object' && address
        ? `http://localhost:${address.port}`
        : ''

    const res = await fetch(`${url}/signalk/v2/api/tracks/imported:known`, {
      method: 'DELETE'
    })

    expect(res.status).to.equal(200)
    expect(deleted).to.equal('imported:known')
  })

  it('requires administrative permission to delete', async () => {
    await serve(writingProvider(), true, false)
    const res = await fetch(`${base}/signalk/v2/api/tracks/imported:known`, {
      method: 'DELETE'
    })

    expect(res.status).to.equal(403)
  })

  it('does not consult the write permission when deleting', async () => {
    // Write access to your own vessel is not authority to remove a track.
    await serve(writingProvider(), true, false)
    await fetch(`${base}/signalk/v2/api/tracks/imported:known`, {
      method: 'DELETE'
    })

    expect(authorisedFor).to.be.empty
  })

  it('rejects an unknown query parameter rather than ignoring it', async () => {
    // Silently dropping a filter a client asked for is how a client ends up
    // trusting an unfiltered answer -- the failure this API should not repeat.
    await serve()
    const res = await fetch(
      `${base}/signalk/v2/api/tracks?duration=PT1H&circle=500`
    )
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/unknown query parameter: circle/)
  })
})
