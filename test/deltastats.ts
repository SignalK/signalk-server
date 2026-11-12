/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'assert'
import {
  OWN_RATE_TIMEOUT_MS,
  incDeltaStatistics,
  publishRates,
  STATS_PROVIDER_ID
} from '../src/deltastats'

function fakeApp() {
  const sent: { providerId: string; delta: any }[] = []
  const app: any = {
    selfId: 'urn:mrn:signalk:uuid:test',
    deltaCount: 0,
    lastIntervalDeltaCount: 0,
    providerStatistics: {},
    providers: [{ id: 'can0' }, { id: 'ais' }],
    handleMessage: (providerId: string, delta: any) =>
      sent.push({ providerId, delta })
  }
  return { app, sent }
}

const delta = (path: string, context?: string) => ({
  context,
  updates: [{ values: [{ path, value: 1 }] }]
})

const published = (sent: { delta: any }[]) =>
  Object.fromEntries(
    sent.flatMap(({ delta }) =>
      delta.updates[0].values.map((pv: any) => [pv.path, pv.value])
    )
  )

describe('provider rates', () => {
  it('writes each connection rate under providers.<id>', () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(app, 'can0', delta('navigation.speedOverGround'))
    app.providerStatistics.can0.deltaRate = 12
    app.providerStatistics.can0.writeRate = 3
    publishRates(app)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].providerId, STATS_PROVIDER_ID)
    // ais has sent nothing yet, so it has no statistics to publish
    assert.deepEqual(published(sent), {
      'providers.can0.deltaRate': 12,
      'providers.can0.writeRate': 3
    })
  })

  it('writes a rate again only when it changes', () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(app, 'can0', delta('navigation.speedOverGround'))
    publishRates(app)
    assert.deepEqual(published(sent), {
      'providers.can0.deltaRate': 0,
      'providers.can0.writeRate': 0
    })
    sent.length = 0
    publishRates(app)
    assert.equal(sent.length, 0)
    app.providerStatistics.can0.deltaRate = 4
    publishRates(app)
    assert.deepEqual(published(sent), { 'providers.can0.deltaRate': 4 })
  })

  it('leaves a rate to a connection that writes it itself', () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(app, 'can0', delta('providers.can0.deltaRate'))
    incDeltaStatistics(
      app,
      'ais',
      delta('providers.ais.writeRate', `vessels.${app.selfId}`)
    )
    publishRates(app)
    assert.deepEqual(Object.keys(published(sent)).sort(), [
      'providers.ais.deltaRate',
      'providers.can0.writeRate'
    ])
  })

  it('takes a rate back when the connection stops writing it', () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(app, 'can0', delta('navigation.speedOverGround'))
    // The server has already written 0 before the connection took over.
    publishRates(app)
    incDeltaStatistics(app, 'can0', delta('providers.can0.deltaRate'))
    sent.length = 0
    publishRates(app, Date.now() + OWN_RATE_TIMEOUT_MS - 1000)
    assert.equal(published(sent)['providers.can0.deltaRate'], undefined)
    sent.length = 0
    publishRates(app, Date.now() + OWN_RATE_TIMEOUT_MS)
    assert.equal(published(sent)['providers.can0.deltaRate'], 0)
  })

  it("ignores another vessel's or provider's rates", () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(
      app,
      'can0',
      delta('providers.can0.deltaRate', 'vessels.urn:mrn:imo:mmsi:244000000')
    )
    incDeltaStatistics(app, 'can0', delta('providers.ais.deltaRate'))
    publishRates(app)
    assert.deepEqual(Object.keys(published(sent)).sort(), [
      'providers.can0.deltaRate',
      'providers.can0.writeRate'
    ])
  })

  it('ignores a rate in an update the server discards', () => {
    const { app, sent } = fakeApp()
    incDeltaStatistics(app, 'can0', {
      updates: [
        { values: [{ path: 'providers.can0.deltaRate', value: 1 }, null] }
      ]
    })
    publishRates(app)
    assert.deepEqual(Object.keys(published(sent)).sort(), [
      'providers.can0.deltaRate',
      'providers.can0.writeRate'
    ])
  })

  it('sends nothing without connections', () => {
    const { app, sent } = fakeApp()
    app.providers = []
    incDeltaStatistics(app, 'defaults', delta('design.length'))
    publishRates(app)
    assert.equal(sent.length, 0)
  })
})
