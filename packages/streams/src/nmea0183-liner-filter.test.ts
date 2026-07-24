import { expect } from 'chai'
import Liner from './liner'
import Replacer from './replacer'
import Nmea0183LinerFilter from './nmea0183-liner-filter'

const NUL = String.fromCharCode(0)

const VERSION_JSON =
  '{"class":"VERSION","release":"3.22","rev":"3.22","proto_major":3,"proto_minor":14}'
const DEVICES_JSON = '{"class":"DEVICES","devices":[]}'
const WATCH_JSON = '{"class":"WATCH","enable":true,"json":false,"nmea":true}'
const RMC =
  '$GPRMC,144326.00,A,5107.0017737,N,11402.3291611,W,0.080,323.3,210307,0.0,E,A*20'
const GGA =
  '$GPGGA,144326.00,5107.0017737,N,11402.3291611,W,1,08,0.99,1577.90,M,-17.98,M,,*68'
const AIS = '!AIVDM,1,1,,A,13aEOg?000PdkO@Mcq`bY@0000,0*35'
// Byte offset at which the fragmented writes are split, mid-sentence.
const FRAGMENT_INDEX = 20

const collect = (
  filter: Nmea0183LinerFilter,
  lines: string[],
  done: Mocha.Done,
  assert: (results: string[]) => void
) => {
  const results: string[] = []
  filter.on('data', (d: string) => results.push(d))
  filter.on('finish', () => {
    assert(results)
    done()
  })
  for (const line of lines) {
    filter.write(line)
  }
  filter.end()
}

describe('Nmea0183LinerFilter', () => {
  it('passes NMEA talker sentences through', (done) => {
    collect(new Nmea0183LinerFilter(), [RMC, GGA], done, (results) => {
      expect(results).to.deep.equal([RMC, GGA])
    })
  })

  it('passes AIS sentences through', (done) => {
    collect(new Nmea0183LinerFilter(), [AIS], done, (results) => {
      expect(results).to.deep.equal([AIS])
    })
  })

  it('drops gpsd JSON protocol messages', (done) => {
    collect(
      new Nmea0183LinerFilter(),
      [VERSION_JSON, DEVICES_JSON, WATCH_JSON],
      done,
      (results) => {
        expect(results).to.deep.equal([])
      }
    )
  })

  it('drops empty and non-NMEA lines', (done) => {
    collect(new Nmea0183LinerFilter(), ['', 'garbage'], done, (results) => {
      expect(results).to.deep.equal([])
    })
  })

  // Mirrors the gpsd pipeline (Gpsd -> Liner -> Nmea0183LinerFilter): the
  // handshake and NMEA arrive interleaved and split across chunks, and only
  // the NMEA sentences must reach downstream. The handshake appears twice to
  // model the VERSION/DEVICES messages gpsd resends after a reconnect.
  it('keeps only NMEA when fed the gpsd handshake through Liner', (done) => {
    const liner = new Liner()
    const filter = new Nmea0183LinerFilter()
    liner.pipe(filter)
    const results: string[] = []
    filter.on('data', (d: string) => results.push(d))
    filter.on('finish', () => {
      expect(results).to.deep.equal([RMC, GGA, RMC, GGA])
      done()
    })
    // Fragment both a JSON message and an NMEA sentence mid-line across writes
    // to exercise Liner's carry-over buffer for dropped and forwarded lines.
    liner.write(VERSION_JSON.slice(0, FRAGMENT_INDEX))
    liner.write(VERSION_JSON.slice(FRAGMENT_INDEX) + '\n' + DEVICES_JSON + '\n')
    liner.write(RMC.slice(0, FRAGMENT_INDEX))
    liner.write(RMC.slice(FRAGMENT_INDEX) + '\n' + GGA + '\n')
    // Second handshake, as after a reconnect.
    liner.write(VERSION_JSON + '\n' + DEVICES_JSON + '\n')
    liner.write(RMC + '\n' + GGA + '\n')
    liner.end()
  })

  // Mirrors the gpsd pipeline stage order in simple.ts (Liner -> removeNulls
  // Replacer -> Nmea0183LinerFilter). The filter must run after null cleanup:
  // a sentence prefixed by a stray NUL would otherwise fail the '$' check and
  // be dropped, losing NMEA data when removeNulls is enabled.
  it('forwards a NUL-prefixed sentence when removeNulls runs first', (done) => {
    const liner = new Liner()
    const removeNulls = new Replacer({ regexp: NUL, template: '' })
    const filter = new Nmea0183LinerFilter()
    liner.pipe(removeNulls)
    removeNulls.pipe(filter)
    const results: string[] = []
    filter.on('data', (d: string) => results.push(d))
    filter.on('finish', () => {
      expect(results).to.deep.equal([RMC, GGA])
      done()
    })
    liner.write(NUL + RMC + '\n' + GGA + '\n')
    liner.end()
  })
})
