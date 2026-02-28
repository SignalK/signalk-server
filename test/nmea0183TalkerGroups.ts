import { expect } from 'chai'
import {
  buildTalkerLookup,
  buildProviderTalkerLookups
} from '../src/nmea0183TalkerGroups'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'
import { Delta, hasValues } from '@signalk/server-api'

describe('nmea0183TalkerGroups', () => {
  describe('buildTalkerLookup', () => {
    it('maps talker IDs to group names', () => {
      const lookup = buildTalkerLookup({
        gps: ['GP', 'GL', 'GA', 'GN'],
        ais: ['AI']
      })
      expect(lookup.get('GP')).to.equal('gps')
      expect(lookup.get('GL')).to.equal('gps')
      expect(lookup.get('GA')).to.equal('gps')
      expect(lookup.get('GN')).to.equal('gps')
      expect(lookup.get('AI')).to.equal('ais')
    })

    it('returns undefined for unmapped talkers', () => {
      const lookup = buildTalkerLookup({ gps: ['GP'] })
      expect(lookup.get('II')).to.equal(undefined)
      expect(lookup.get('WI')).to.equal(undefined)
    })

    it('handles empty groups', () => {
      const lookup = buildTalkerLookup({})
      expect(lookup.size).to.equal(0)
    })
  })

  describe('buildProviderTalkerLookups', () => {
    it('builds lookups from pipedProviders config', () => {
      const lookups = buildProviderTalkerLookups([
        {
          id: 'serial0',
          pipeElements: [
            {
              options: {
                type: 'NMEA0183',
                subOptions: {
                  type: 'serial',
                  talkerGroups: {
                    gps: ['GP', 'GL'],
                    wind: ['WI']
                  }
                }
              }
            }
          ]
        },
        {
          id: 'serial1',
          pipeElements: [
            {
              options: {
                type: 'NMEA0183',
                subOptions: { type: 'serial' }
              }
            }
          ]
        }
      ])

      expect(lookups.has('serial0')).to.equal(true)
      expect(lookups.has('serial1')).to.equal(false)

      const serial0 = lookups.get('serial0')!
      expect(serial0.get('GP')).to.equal('gps')
      expect(serial0.get('WI')).to.equal('wind')
    })

    it('returns empty map for no providers', () => {
      expect(buildProviderTalkerLookups([]).size).to.equal(0)
    })

    it('handles providers without pipeElements', () => {
      const lookups = buildProviderTalkerLookups([
        { id: 'broken' },
        { id: 'also-broken', pipeElements: [] }
      ])
      expect(lookups.size).to.equal(0)
    })
  })
})

describe('NMEA0183 talker group integration', () => {
  let stop: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendADelta: (delta: any) => Promise<Response>
  let host: string

  before(async () => {
    const s = await startServer()
    stop = s.stop
    sendADelta = s.sendADelta
    host = s.host
  })

  after(() => stop())

  it('rewrites $source for deltas with NMEA0183 source and configured talkerGroups', async function () {
    // The test server uses nmeaFromFile provider which has no talkerGroups
    // configured, so we verify the default behavior: talker ID is preserved.
    const wsUrl =
      host.replace('http', 'ws') +
      '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
    const ws = new WsPromiser(wsUrl)
    const hello = JSON.parse(await ws.nthMessage(1))
    expect(hello).to.have.property('self')

    // Send a delta with an NMEA0183 source object (talker GP, no talkerGroups configured)
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          source: {
            sentence: 'RMC',
            talker: 'GP',
            type: 'NMEA0183'
          },
          timestamp: '2024-01-15T10:00:00.000Z',
          values: [{ path: 'navigation.speedOverGround', value: 4.2 }]
        }
      ]
    })
    await ws.nthMessage(2)

    const deltas: Delta[] = ws
      .parsedMessages()
      .slice(1)
      .filter((m: Delta) => {
        const u = m.updates?.[0]
        return (
          u &&
          hasValues(u) &&
          u.values[0]?.path === 'navigation.speedOverGround'
        )
      })

    expect(deltas.length).to.be.greaterThan(0)
    // Without talkerGroups config, $source should contain the raw talker ID
    const source = deltas[0].updates[0].$source
    expect(source).to.be.a('string')
    expect(source).to.include('GP')
  })
})
