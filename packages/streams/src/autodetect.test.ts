import { expect } from 'chai'
import { EventEmitter } from 'events'
import DeMultiplexer from './autodetect'
import Liner from './liner'
import type { DeltaCache } from './types'

function createAutodetectApp() {
  const emitter = new EventEmitter()
  const signalk = new EventEmitter()
  return Object.assign(emitter, {
    selfContext: 'vessels.urn:mrn:imo:mmsi:000000000',
    isNmea2000OutAvailable: false,
    deltaCache: {
      setSourceDelta(_key: string, _delta: object): void {}
    } as DeltaCache,
    handleMessage(_id: string, _delta: object): void {},
    signalk
  })
}

const SK_DELTA = JSON.stringify({
  updates: [
    {
      source: { label: 'test' },
      values: [{ path: 'navigation.speedOverGround', value: 5 }]
    }
  ],
  context: 'vessels.urn:mrn:imo:mmsi:000000000'
})

const MUX_DELTA = `${Date.now()};I;${SK_DELTA}`

const N2K_DATA =
  '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'

interface DecodedPgn {
  pgn: number
  timestamp: string
}

function expectedPgn(timestamp: number): DecodedPgn {
  return { pgn: 127250, timestamp: new Date(timestamp).toISOString() }
}

function pgnIdentities(pgns: DecodedPgn[]): DecodedPgn[] {
  return pgns.map(({ pgn, timestamp }) => ({ pgn, timestamp }))
}

function replayN2kLog(
  lines: string[],
  noThrottle: boolean,
  expectedPgns: DecodedPgn[]
): Promise<DecodedPgn[]> {
  return replayN2kChunks([`${lines.join('\n')}\n`], noThrottle, expectedPgns)
}

function replayN2kChunks(
  chunks: string[],
  noThrottle: boolean,
  expectedPgns: DecodedPgn[]
): Promise<DecodedPgn[]> {
  const app = createAutodetectApp()
  const demux = new DeMultiplexer({
    app,
    providerId: 'test-auto',
    noThrottle
  })
  const liner = new Liner()
  const pgns: DecodedPgn[] = []
  liner.pipe(demux)

  return new Promise((resolve, reject) => {
    let linerFinished = false
    let settled = false
    const finish = (callback: () => void): void => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        callback()
      }
    }
    const observe = (): void => {
      if (pgns.length > expectedPgns.length) {
        finish(() =>
          reject(
            new Error(
              `Received ${pgns.length} PGNs, expected ${expectedPgns.length}`
            )
          )
        )
      } else if (linerFinished && pgns.length === expectedPgns.length) {
        finish(() => resolve(pgns))
      }
    }
    const timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Timed out waiting for ${expectedPgns.length} PGNs; received ${pgns.length}`
          )
        )
      )
    }, 1000)

    app.on('N2KAnalyzerOut', (pgn: DecodedPgn) => {
      pgns.push(pgn)
      observe()
    })
    liner.on('finish', () => {
      linerFinished = true
      observe()
    })
    for (const chunk of chunks) {
      liner.write(chunk)
    }
    liner.end()
  })
}

describe('DeMultiplexer (autodetect)', () => {
  it('detects multiplexed log format and parses Signal K delta', (done) => {
    const app = createAutodetectApp()
    const demux = new DeMultiplexer({
      app,
      providerId: 'test-auto',
      noThrottle: true
    })

    demux.once('data', (d: unknown) => {
      const delta = d as {
        updates: Array<{ values: Array<{ path: string }> }>
      }
      expect(delta.updates[0]!.values[0]!.path).to.equal(
        'navigation.speedOverGround'
      )
      done()
    })

    demux.write(MUX_DELTA)
  })

  for (const noThrottle of [true, false]) {
    it(`continues after a NUL-only log row (${noThrottle ? 'without' : 'with'} throttling)`, async () => {
      const timestamp = 1700000000000
      const expectedPgns = [expectedPgn(timestamp), expectedPgn(timestamp + 2)]
      const pgns = await replayN2kLog(
        [
          `${timestamp};A;${N2K_DATA}`,
          '\u0000'.repeat(64),
          `${timestamp + 2};A;${N2K_DATA}`
        ],
        noThrottle,
        expectedPgns
      )

      expect(pgnIdentities(pgns)).to.deep.equal(expectedPgns)
    })

    it(`continues after a parseable N2K row with an invalid outer timestamp (${noThrottle ? 'without' : 'with'} throttling)`, async () => {
      const timestamp = 1700000000000
      const expectedPgns = [expectedPgn(timestamp), expectedPgn(timestamp + 2)]
      const pgns = await replayN2kLog(
        [
          `${timestamp};A;${N2K_DATA}`,
          `not-a-timestamp;A;${N2K_DATA}`,
          `${timestamp + 2};A;${N2K_DATA}`
        ],
        noThrottle,
        expectedPgns
      )

      expect(pgnIdentities(pgns)).to.deep.equal(expectedPgns)
    })

    it(`skips a NUL-contaminated row when it has no line terminator (${noThrottle ? 'without' : 'with'} throttling)`, async () => {
      const timestamp = 1700000000000
      const expectedPgns = [expectedPgn(timestamp), expectedPgn(timestamp + 4)]
      const pgns = await replayN2kChunks(
        [
          `${timestamp};A;${N2K_DATA}\n`,
          '\u0000'.repeat(64),
          `${timestamp + 2};A;${N2K_DATA}\n`,
          `${timestamp + 4};A;${N2K_DATA}\n`
        ],
        noThrottle,
        expectedPgns
      )

      expect(pgnIdentities(pgns)).to.deep.equal(expectedPgns)
    })
  }

  it('does not let a blank multiplexed timestamp alter replay timing', () => {
    const originalNow = Date.now
    const originalSetTimeout = global.setTimeout
    const delays: number[] = []
    Date.now = () => 10000
    global.setTimeout = ((callback: () => void, delay?: number) => {
      delays.push(delay ?? 0)
      callback()
      return undefined as unknown as NodeJS.Timeout
    }) as typeof setTimeout

    try {
      const demux = new DeMultiplexer({
        app: createAutodetectApp(),
        providerId: 'test-auto',
        noThrottle: false
      })

      for (const timestamp of [
        '0000000000100',
        '             ',
        '0000000000125'
      ]) {
        demux.write(`${timestamp};A;${N2K_DATA}`)
      }

      expect(delays).to.deep.equal([25])
    } finally {
      Date.now = originalNow
      global.setTimeout = originalSetTimeout
    }
  })
})
