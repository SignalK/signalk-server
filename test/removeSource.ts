// Coverage for DELETE /skServer/removeSource — the generic source
// remover used by the priority-group trash icon for non-N2K sources.
// The N2K eviction path is owned by /skServer/n2kRemoveSource.
//
// `sourceDeltas` only fills via the N2K parser. Plain HTTP-injected
// deltas (and NMEA0183 talkers in production) populate the live cache
// + sourceMeta + sources tree without ever landing in sourceDeltas.
// The endpoint must work for both shapes — these tests assert that.

import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, sendDelta } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

const uuid = 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'

const delta = {
  context: 'vessels.' + uuid,
  updates: [
    {
      source: {
        label: '0183-1',
        talker: 'II',
        sentence: 'HDM',
        type: 'NMEA0183'
      },
      values: [{ path: 'navigation.headingMagnetic', value: 1.234 }]
    }
  ]
}

const SOURCE_REF = '0183-1.II'

describe('DELETE /skServer/removeSource', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, false)
    await sendDelta(delta, `${url}/signalk/v1/api/_test/delta`)
    // Wait for ingestion: streambundle pump runs on the next tick.
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 2000
      const tick = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sources = (server.app.signalk as any)?.sources as
          | Record<string, Record<string, unknown>>
          | undefined
        if (sources?.['0183-1']?.['II']) return resolve()
        if (Date.now() > deadline) {
          return reject(
            new Error(
              'delta never landed in signalk.sources; tree=' +
                JSON.stringify(sources)
            )
          )
        }
        setTimeout(tick, 25)
      }
      tick()
    })
  })

  after(async function () {
    await server.stop()
  })

  it('rejects requests without sourceRef', async function () {
    const res = await fetch(`${url}/skServer/removeSource`, {
      method: 'DELETE'
    })
    res.status.should.equal(400)
  })

  it('returns 404 for unknown sourceRef', async function () {
    const res = await fetch(
      `${url}/skServer/removeSource?sourceRef=does-not-exist`,
      { method: 'DELETE' }
    )
    res.status.should.equal(404)
  })

  it('removes a 0183 source from sources tree and sourceMeta', async function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = (server.app.signalk as any).sources as Record<
      string,
      Record<string, unknown>
    >
    sources.should.have.nested.property('0183-1.II')
    // Sanity: deltacache.cache must hold the leaf before eviction —
    // otherwise the post-eviction assertion is vacuous and any
    // regression where eviction silently no-ops would still pass.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findLeaf = (cache: any, ref: string): boolean => {
      if (!cache || typeof cache !== 'object') return false
      for (const key of Object.keys(cache)) {
        if (key === 'meta') continue
        const child = cache[key]
        if (!child || typeof child !== 'object') continue
        if (child.path !== undefined && child.value !== undefined) {
          if (key === ref) return true
        } else if (findLeaf(child, ref)) {
          return true
        }
      }
      return false
    }
    chai
      .expect(findLeaf(server.app.deltaCache.cache, SOURCE_REF))
      .to.equal(true)
    // Sanity: FullSignalK root must hold the value-leaf — that's the
    // tree the REST API and WS replay read from. If eviction doesn't
    // prune it, the Data Browser keeps showing zombie rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = (server.app.signalk as any).root
    const headingLeaf = root.vessels?.[uuid]?.navigation?.headingMagnetic
    chai
      .expect(headingLeaf?.['$source'], 'pre-evict $source')
      .to.equal(SOURCE_REF)

    const res = await fetch(
      `${url}/skServer/removeSource?sourceRef=${encodeURIComponent(SOURCE_REF)}`,
      { method: 'DELETE' }
    )
    res.status.should.equal(200)
    const body = await res.json()
    body.should.have.property('state', 'COMPLETED')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourcesAfter = (server.app.signalk as any).sources as Record<
      string,
      Record<string, unknown>
    >
    // The connection wrapper itself drops away when the last sub-key
    // is gone, so check via optional chaining instead of expecting an
    // empty object.
    const stillThere = sourcesAfter['0183-1']?.['II']
    chai.expect(stillThere).to.equal(undefined)
    // The deltacache leaves must also be gone — without this assertion
    // a silent regression in removeSource would leave the DataBrowser
    // showing the source even though sources tree was trimmed.
    chai
      .expect(findLeaf(server.app.deltaCache.cache, SOURCE_REF))
      .to.equal(false)
    // FullSignalK root must lose the leaf too (singleton form here:
    // there's only one source for navigation.headingMagnetic).
    const headingLeafAfter = root.vessels?.[uuid]?.navigation?.headingMagnetic
    chai
      .expect(headingLeafAfter?.['$source'], 'post-evict $source')
      .to.equal(undefined)
    chai.expect(headingLeafAfter?.value, 'post-evict value').to.equal(undefined)
  })

  it('emits SOURCEEVICTED so admin-ui clients can prune their mirror', async function () {
    // Re-seed the source for this test (the previous test removed it).
    await sendDelta(delta, `${url}/signalk/v1/api/_test/delta`)
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 2000
      const tick = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sources = (server.app.signalk as any)?.sources
        if (sources?.['0183-1']?.['II']) return resolve()
        if (Date.now() > deadline) return reject(new Error('reseed timeout'))
        setTimeout(tick, 25)
      }
      tick()
    })

    const events: Array<{ type: string; data: unknown }> = []
    const onEvent = (e: { type: string; data: unknown }) => events.push(e)
    server.app.on('serverevent', onEvent)
    try {
      const res = await fetch(
        `${url}/skServer/removeSource?sourceRef=${encodeURIComponent(SOURCE_REF)}`,
        { method: 'DELETE' }
      )
      res.status.should.equal(200)
    } finally {
      server.app.removeListener('serverevent', onEvent)
    }
    const evicted = events.find((e) => e.type === 'SOURCEEVICTED')
    chai
      .expect(evicted, 'SOURCEEVICTED was not emitted')
      .to.not.equal(undefined)
    chai.expect(evicted!.data).to.deep.equal({ sourceRef: SOURCE_REF })
  })
})
