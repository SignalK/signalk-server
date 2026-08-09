import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

describe('Sensors API - gnss', () => {
  it('GET returns the default (off, no sensors) config with status', async function () {
    const { selfGetJson, stop } = await startServer()
    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: unknown[]
      status: { mode: string; active: boolean; blocked?: string }
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.deep.equal([])
    expect(data.status.mode).to.equal('off')
    expect(data.status.active).to.equal(false)
    await stop()
  })

  it('PUT stores the antenna config and GET reflects it', async function () {
    const { selfPut, selfGetJson, stop } = await startServer()
    const payload = {
      correction: 'off',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 0 }
      ]
    }
    const put = await selfPut('sensors/gnss', payload)
    expect(put.status).to.equal(200)
    const body = (await put.json()) as { result: string }
    expect(body.result).to.equal('ok')

    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: Array<{ sensorId: string; fromBow: number }>
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.have.length(1)
    expect(data.sensors[0].sensorId).to.equal('gnss1')
    expect(data.sensors[0].fromBow).to.equal(3)
    await stop()
  })

  it('PUT rejects a duplicate sensorId with 400', async function () {
    const { selfPut, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'off',
      sensors: [
        { sensorId: 'dup', $source: 'test.1', fromBow: 1, fromCenter: 0 },
        { sensorId: 'dup', $source: 'test.2', fromBow: 2, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(400)
    const body = (await put.json()) as { state: string; message: string }
    expect(body.state).to.equal('FAILED')
    expect(body.message).to.match(/Duplicate sensorId/)
    await stop()
  })

  it('PUT rejects an unknown correction mode with 400', async function () {
    const { selfPut, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'nonsense',
      sensors: []
    })
    expect(put.status).to.equal(400)
    await stop()
  })

  it('DELETE clears the config', async function () {
    const { selfPut, selfDelete, selfGetJson, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'replace',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(200)
    const del = await selfDelete('sensors/gnss')
    expect(del.status).to.equal(200)

    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: unknown[]
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.deep.equal([])
    await stop()
  })

  it('PUT rejects an offset outside the configured hull with 400', async function () {
    const { selfPut, host, stop } = await startServer()
    // Configure vessel dimensions so the bounds check has something to
    // check against (skipped otherwise).
    const vesselPut = await fetch(`${host}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({ length: 20, beam: 6 }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(vesselPut.status).to.equal(200)

    const put = await selfPut('sensors/gnss', {
      correction: 'off',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 99, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(400)
    const body = (await put.json()) as { state: string; message: string }
    expect(body.state).to.equal('FAILED')
    expect(body.message).to.match(/fromBow 99 out of range/)
    await stop()
  })
})
