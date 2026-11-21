// End-to-end coverage for PGN 130310 conflict handling: deltas land in
// the SK tree, GET /skServer/n2kDeviceStatus derives pgnSourceKeys from
// that tree, and the admin UI's detectInstanceConflicts consumes the
// payload. A DST810 (sea temperature) and an SCX-20 (outside
// temperature + pressure) both on device instance 0 share PGN 130310
// but publish disjoint leaf paths — no conflict. A second barometer
// publishing the same leaf path still flags.

import { expect } from 'chai'
import path from 'path'
import { pathToFileURL } from 'url'
import { freeport } from './ts-servertestutilities'
import { startServerP, sendDelta } from './servertestutilities'
import type { N2kDeviceEntry } from '../packages/server-admin-ui/src/utils/sourceLabels'

type SourceLabelsModule =
  typeof import('../packages/server-admin-ui/src/utils/sourceLabels')

// server-admin-ui is `"type": "module"`, so its .ts files can't be
// require()d from this CJS suite — and ts-node downlevels a plain
// import() into exactly that require. The Function constructor hides
// the import() from ts-node so Node's native ESM loader (with built-in
// type stripping) handles the file instead.
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<SourceLabelsModule>

const loadSourceLabels = () =>
  importEsm(
    pathToFileURL(
      path.join(
        __dirname,
        '../packages/server-admin-ui/src/utils/sourceLabels.ts'
      )
    ).href
  )

type DeviceStatusPayload = {
  pgnDataInstances: Record<string, Record<string, number[]>>
  pgnSourceKeys: Record<string, Record<string, string[]>>
}

const SOURCE_KEYS_TIMEOUT_MS = 5_000
const SOURCE_KEYS_POLL_INTERVAL_MS = 25
const SERVER_STARTUP_TIMEOUT_MS = 60_000

const n2kDelta = (src: string, values: { path: string; value: number }[]) => ({
  updates: [
    {
      source: { label: 'IPG100', type: 'NMEA2000', src, pgn: 130310 },
      values
    }
  ]
})

const device = (src: string): N2kDeviceEntry => ({
  sourceRef: `IPG100.${src}`,
  connection: 'IPG100',
  srcAddr: src,
  src,
  deviceInstance: 0,
  pgns: { '130310': '' }
})

describe('GET /skServer/n2kDeviceStatus 130310 source keys', function () {
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let detectInstanceConflicts: SourceLabelsModule['detectInstanceConflicts']

  const fetchDeviceStatus = async (): Promise<DeviceStatusPayload> => {
    const res = await fetch(`${url}/skServer/n2kDeviceStatus`)
    expect(res.status).to.equal(200)
    return res.json()
  }

  // Ingestion is asynchronous (streambundle pumps on the next tick), so
  // poll until every expected sourceRef shows up in pgnSourceKeys.
  const waitForSourceKeys = async (
    sourceRefs: string[]
  ): Promise<DeviceStatusPayload> => {
    const deadline = Date.now() + SOURCE_KEYS_TIMEOUT_MS
    for (;;) {
      const payload = await fetchDeviceStatus()
      if (sourceRefs.every((ref) => payload.pgnSourceKeys[ref]?.['130310'])) {
        return payload
      }
      if (Date.now() > deadline) {
        throw new Error(
          'pgnSourceKeys never populated for ' +
            sourceRefs.join(', ') +
            '; got ' +
            JSON.stringify(payload.pgnSourceKeys)
        )
      }
      await new Promise((resolve) =>
        setTimeout(resolve, SOURCE_KEYS_POLL_INTERVAL_MS)
      )
    }
  }

  before(async function () {
    // Server startup dominates; on a loaded machine it can exceed the
    // suite-wide 20 s default.
    this.timeout(SERVER_STARTUP_TIMEOUT_MS)
    ;({ detectInstanceConflicts } = await loadSourceLabels())
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, false)
    const deltaUrl = `${url}/signalk/v1/api/_test/delta`
    // DST810: populates only the water-temperature field of 130310
    await sendDelta(
      n2kDelta('35', [{ path: 'environment.water.temperature', value: 293.5 }]),
      deltaUrl
    )
    // SCX-20: populates outside temperature + pressure
    await sendDelta(
      n2kDelta('4', [
        { path: 'environment.outside.temperature', value: 288.15 },
        { path: 'environment.outside.pressure', value: 101325 }
      ]),
      deltaUrl
    )
  })

  after(async function () {
    await server.stop()
  })

  it('keys each 130310 sender by its published leaf paths', async function () {
    const payload = await waitForSourceKeys(['IPG100.35', 'IPG100.4'])
    expect(payload.pgnSourceKeys['IPG100.35']['130310']).to.deep.equal([
      'environment.water.temperature'
    ])
    expect(payload.pgnSourceKeys['IPG100.4']['130310']).to.deep.equal([
      'environment.outside.pressure',
      'environment.outside.temperature'
    ])
  })

  it('sea-temp vs outside-temp senders on instance 0 do not conflict', async function () {
    const payload = await waitForSourceKeys(['IPG100.35', 'IPG100.4'])
    const conflicts = detectInstanceConflicts(
      [device('35'), device('4')],
      payload.pgnDataInstances,
      payload.pgnSourceKeys
    )
    expect(conflicts).to.deep.equal([])
  })

  it('a second sender of the same 130310 field still conflicts', async function () {
    await sendDelta(
      n2kDelta('7', [{ path: 'environment.outside.pressure', value: 101300 }]),
      `${url}/signalk/v1/api/_test/delta`
    )
    const payload = await waitForSourceKeys(['IPG100.4', 'IPG100.7'])
    const conflicts = detectInstanceConflicts(
      [device('4'), device('7')],
      payload.pgnDataInstances,
      payload.pgnSourceKeys
    )
    expect(conflicts).to.have.lengthOf(1)
    expect(conflicts[0].sharedPGNs).to.deep.equal(['130310'])
  })
})
