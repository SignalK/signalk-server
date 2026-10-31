import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

interface DepthConfig {
  sensors: Array<{
    sensorId: string
    $source: string
    fromBow: number | null
    fromCenter: number | null
    fromWaterline: number | null
  }>
}

const KEEL_TRANSDUCER = {
  sensorId: 'keel',
  $source: 'test.35',
  fromBow: 6.5,
  fromCenter: -0.3,
  fromWaterline: 0.7
}

describe('Sensors API - depth', () => {
  it('GET returns no transducers by default', async function () {
    const { selfGetJson, stop } = await startServer()
    try {
      const data = (await selfGetJson('sensors/depth')) as DepthConfig
      expect(data).to.deep.equal({ sensors: [] })
    } finally {
      await stop()
    }
  })

  it('PUT stores the transducers and GET reflects them', async function () {
    const { selfPut, selfGetJson, stop } = await startServer()
    try {
      const second = {
        sensorId: 'forward',
        $source: 'nmea0183.II',
        fromBow: 3,
        fromCenter: 0,
        fromWaterline: null
      }
      const put = await selfPut('sensors/depth', {
        sensors: [KEEL_TRANSDUCER, second]
      })
      expect(put.status).to.equal(200)
      expect(await put.json()).to.deep.equal({ result: 'ok' })

      const data = (await selfGetJson('sensors/depth')) as DepthConfig
      expect(data.sensors).to.deep.equal([KEEL_TRANSDUCER, second])
    } finally {
      await stop()
    }
  })

  it('PUT rejects a duplicate $source with 400', async function () {
    const { selfPut, stop } = await startServer()
    try {
      const put = await selfPut('sensors/depth', {
        sensors: [KEEL_TRANSDUCER, { ...KEEL_TRANSDUCER, sensorId: 'other' }]
      })
      expect(put.status).to.equal(400)
      const body = (await put.json()) as { message: string }
      expect(body.message).to.match(/Duplicate \$source/)
    } finally {
      await stop()
    }
  })

  it('PUT rejects a transducer above the waterline with 400', async function () {
    const { selfPut, stop } = await startServer()
    try {
      const put = await selfPut('sensors/depth', {
        sensors: [{ ...KEEL_TRANSDUCER, fromWaterline: -0.2 }]
      })
      expect(put.status).to.equal(400)
      const body = (await put.json()) as { message: string }
      expect(body.message).to.match(/above the waterline/)
    } finally {
      await stop()
    }
  })

  it('PUT rejects a transducer below the keel with 400', async function () {
    const { selfPut, host, stop } = await startServer()
    try {
      const vesselPut = await fetch(`${host}/skServer/vessel`, {
        method: 'PUT',
        body: JSON.stringify({ length: 20, beam: 6, draft: 1.7 }),
        headers: { 'Content-Type': 'application/json' }
      })
      expect(vesselPut.status).to.equal(200)

      const put = await selfPut('sensors/depth', {
        sensors: [{ ...KEEL_TRANSDUCER, fromWaterline: 2 }]
      })
      expect(put.status).to.equal(400)
      const body = (await put.json()) as { message: string }
      expect(body.message).to.match(/below the draft 1.7/)
    } finally {
      await stop()
    }
  })

  it('DELETE clears the transducers', async function () {
    const { selfPut, selfDelete, selfGetJson, stop } = await startServer()
    try {
      await selfPut('sensors/depth', { sensors: [KEEL_TRANSDUCER] })
      const del = await selfDelete('sensors/depth')
      expect(del.status).to.equal(200)
      const data = (await selfGetJson('sensors/depth')) as DepthConfig
      expect(data.sensors).to.deep.equal([])
    } finally {
      await stop()
    }
  })

  it('lists the sources reporting a depth, without derived ones', async function () {
    const { host, sendADelta, stop } = await startServer()
    try {
      const depthUpdate = (
        $source: string,
        path: string
      ): Record<string, unknown> => ({
        context: 'vessels.self',
        updates: [{ $source, values: [{ path, value: 10 }] }]
      })
      await sendADelta(
        depthUpdate('test.35', 'environment.depth.belowTransducer')
      )
      await sendADelta(depthUpdate('test.II', 'environment.depth.belowKeel'))
      await sendADelta(
        depthUpdate('test.35.derived', 'environment.depth.belowSurface')
      )
      await sendADelta(depthUpdate('test.gps', 'navigation.speedOverGround'))

      const res = await fetch(`${host}/skServer/depthSources`)
      expect(res.status).to.equal(200)
      const sources = (await res.json()) as string[]
      expect(sources).to.deep.equal(['test.35', 'test.II'])
    } finally {
      await stop()
    }
  })
})
