import { expect } from 'chai'
import express from 'express'
import type { Server } from 'node:http'
import { TrackApiHttpRegistry } from '../dist/api/tracks/index.js'
import type { Context } from '@signalk/server-api'

/**
 * Provider selection on the tracks route.
 *
 * `providerId` is stamped by the server from its registry rather than by the
 * provider, so it always matches what actually answered. Selection has to stay
 * inside the error-handling path: naming a provider that does not exist throws,
 * and that must surface as a 400 rather than an unhandled error page.
 */
describe('Track API provider stamping', () => {
  const track = (context: Context) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: [[[24.9, 60.1] as [number, number]]]
    },
    properties: {
      context,
      isSelf: false,
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-02T00:00:00Z',
      pointCount: 1
    }
  })

  const provider = () => ({
    getTracks: () =>
      Promise.resolve({
        type: 'FeatureCollection' as const,
        features: [track('vessels.a' as Context)]
      }),
    getTrackContexts: () => Promise.resolve([])
  })

  let server: Server | undefined
  let base = ''

  const serve = async () => {
    const app = express()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = new TrackApiHttpRegistry(app as any)
    registry.registerTrackApiProvider('testprovider', provider())
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

  it('records which provider answered', async () => {
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks?duration=PT1H`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as {
      features: { properties: { providerId?: string } }[]
    }

    expect(body.features[0]?.properties.providerId).to.equal('testprovider')
  })

  it('does not require the provider to name itself', async () => {
    // The stub returns no providerId; the server supplies it from the registry.
    await serve()
    const res = await fetch(`${base}/signalk/v2/api/tracks?duration=PT1H`)
    const body = (await res.json()) as {
      features: { properties: { context: string; providerId?: string } }[]
    }

    expect(body.features[0]?.properties.context).to.equal('vessels.a')
    expect(body.features[0]?.properties.providerId).to.equal('testprovider')
  })

  it('still reports an unknown provider as a client error', async () => {
    // Selecting outside the guarded path turned this into an unhandled error
    // page rather than a 400.
    await serve()
    const res = await fetch(
      `${base}/signalk/v2/api/tracks?provider=nope&duration=PT1H`
    )
    expect(res.status).to.equal(400)
    const body = (await res.json()) as { error: string }

    expect(body.error).to.match(/Requested provider not found/)
  })
})
