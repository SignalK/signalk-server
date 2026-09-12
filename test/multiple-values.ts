import chai, { expect } from 'chai'
// @ts-expect-error no type declarations available
import chaiThings from 'chai-things'
// @ts-expect-error no type declarations available
import { chaiModule } from '@signalk/signalk-schema'
import { freeport } from './ts-servertestutilities'
import { removeServerResolvedMeta } from './serverResolvedMeta'
import { startServerP, sendDelta } from './servertestutilities'

chai.should()
chai.use(chaiThings)
chai.use(chaiModule)

const uuid = 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
const DELTA_ROUNDTRIP_TIMEOUT_MS = 4000

const makeDelta = (tripLog: number, src: string) => ({
  context: 'vessels.' + uuid,
  updates: [
    {
      source: {
        pgn: 128275,
        label: '/dev/actisense',
        src
      },
      values: [
        { path: 'navigation.trip.log', value: tripLog },
        { path: 'navigation.log', value: 17404540 }
      ]
    },
    {
      source: {
        label: '/dev/actisense',
        src: '115',
        pgn: 128267
      },
      values: [
        { path: 'navigation.courseOverGroundTrue', value: 172.9 },
        { path: 'navigation.speedOverGround', value: 3.85 }
      ]
    }
  ]
})

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Chai {
    interface Assertion {
      // Added by @signalk/signalk-schema's chai plugin, which ships no types.
      validSignalK: Assertion
    }
  }
}

interface MetaBearingNode {
  meta?: Record<string, unknown>
  values?: Record<string, { value: unknown }>
}

interface FullModel {
  vessels: Record<
    string,
    {
      navigation: Record<string, MetaBearingNode & Record<string, unknown>> & {
        trip: { log: MetaBearingNode }
      }
    }
  >
}

const readFullModel = async (restUrl: string): Promise<FullModel> => {
  const res = await fetch(restUrl)
  const body = await res.text()
  expect(res.ok, `GET ${restUrl} returned ${res.status}: ${body}`).to.equal(
    true
  )
  const parsed: unknown = JSON.parse(body)
  expect(parsed).to.be.an('object')
  const model = parsed as FullModel
  expect(
    model.vessels?.[uuid]?.navigation,
    `response has no vessels[${uuid}].navigation`
  ).to.be.an('object')
  return model
}

const stripServerResolvedMeta = (tree: FullModel): void => {
  const nav = tree.vessels[uuid].navigation
  removeServerResolvedMeta([
    nav.trip.log,
    nav.log,
    nav.courseOverGroundTrue,
    nav.speedOverGround
  ])
}

describe('Server', function () {
  let server: Awaited<ReturnType<typeof startServerP>> | undefined
  let port: number

  before(async function () {
    port = await freeport()
    server = await startServerP(port)
  })

  after(async function () {
    await server?.stop()
  })

  it('handles two deltas with signalk path', function () {
    const host = 'http://localhost:' + port
    const deltaUrl = host + '/signalk/v1/api/_test/delta'
    const restUrl = host + '/signalk/v1/api/'

    return sendDelta(makeDelta(43374, '115'), deltaUrl)
      .then(() => readFullModel(restUrl))
      .then((treeAfterFirstDelta) => {
        treeAfterFirstDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.value',
          43374
        )
        treeAfterFirstDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.$source',
          'deltaFromHttp.115'
        )
        delete treeAfterFirstDelta.vessels[uuid].navigation.course //FIXME until in schema
        stripServerResolvedMeta(treeAfterFirstDelta)
        treeAfterFirstDelta.should.be.validSignalK

        return sendDelta(makeDelta(1, '115'), deltaUrl)
      })
      .then(() => readFullModel(restUrl))
      .then((treeAfterSecondDelta) => {
        treeAfterSecondDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.value',
          1
        )
        treeAfterSecondDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.$source',
          'deltaFromHttp.115'
        )
        delete treeAfterSecondDelta.vessels[uuid].navigation.course //FIXME until in schema
        stripServerResolvedMeta(treeAfterSecondDelta)
        treeAfterSecondDelta.should.be.validSignalK

        return sendDelta(makeDelta(2, '116'), deltaUrl)
      })
      .then(() => readFullModel(restUrl))
      .then((treeAfterOtherSourceDelta) => {
        treeAfterOtherSourceDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.value',
          2
        )
        treeAfterOtherSourceDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.$source',
          'deltaFromHttp.116'
        )
        // The superseded source keeps its own value alongside the new one.
        treeAfterOtherSourceDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.values.deltaFromHttp\\.115.value',
          1
        )
        treeAfterOtherSourceDelta.vessels[uuid].should.have.nested.property(
          'navigation.trip.log.values.deltaFromHttp\\.116.value',
          2
        )
        delete treeAfterOtherSourceDelta.vessels[uuid].navigation.course //FIXME until in schema
        stripServerResolvedMeta(treeAfterOtherSourceDelta)
        treeAfterOtherSourceDelta.should.be.validSignalK
      })
  }).timeout(DELTA_ROUNDTRIP_TIMEOUT_MS)

  it('preserves a schema-conformant upstream label', function () {
    const host = 'http://localhost:' + port
    const deltaUrl = host + '/signalk/v1/api/_test/delta'
    const restUrl = host + '/signalk/v1/api/'

    const forwarded = {
      context: 'vessels.' + uuid,
      updates: [
        {
          source: {
            label: 'canhat',
            type: 'NMEA2000',
            canName: 'c0788c00e7e04312',
            src: '43',
            pgn: 129025
          },
          values: [{ path: 'navigation.position', value: { latitude: 1 } }]
        }
      ]
    }

    return sendDelta(forwarded, deltaUrl)
      .then(() => readFullModel(restUrl))
      .then((tree) => {
        tree.vessels[uuid].should.have.nested.property(
          'navigation.position.$source',
          'canhat.c0788c00e7e04312'
        )
      })
  }).timeout(DELTA_ROUNDTRIP_TIMEOUT_MS)
})
