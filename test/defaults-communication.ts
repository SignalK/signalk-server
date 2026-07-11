import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

const defaultsWithBareCommunication = {
  defaults: {
    vessels: {
      self: {
        communication: {
          callsignVhf: 'OHTEST',
          phoneNumber: '+358501234567',
          vhf: {
            channel: 16
          }
        }
      }
    }
  }
}

interface StartedServer {
  stop?: () => Promise<unknown> | void
}

describe('Defaults: communication subtree', () => {
  let serverP: Promise<StartedServer>
  let port: number

  before(async () => {
    port = await freeport()
    serverP = startServerP(port, false, defaultsWithBareCommunication)
  })

  after(async () => {
    const server = await serverP
    if (server && typeof server.stop === 'function') {
      await server.stop()
    }
  })

  it('emits per-leaf deltas (not one blob at the parent path)', async () => {
    await serverP
    const res = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/communication`
    )
    const body = await res.json()
    // Each leaf is its own SK value with $source/timestamp/value, not
    // a single defaults-sourced blob hung off the bare parent path.
    expect(body.callsignVhf).to.include({
      $source: 'defaults',
      value: 'OHTEST'
    })
    expect(body.phoneNumber).to.include({
      $source: 'defaults',
      value: '+358501234567'
    })
    expect(body.vhf.channel).to.include({
      $source: 'defaults',
      value: 16
    })
    // The bare parent path itself must not be a leaf — if it were, the
    // response would have value/$source/timestamp at the top level.
    expect(body).to.not.have.property('$source')
    expect(body).to.not.have.property('value')
  })

  it('individual leaves are addressable as full SK paths', async () => {
    await serverP
    const callsign = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/communication/callsignVhf`
    ).then((r) => r.json())
    expect(callsign).to.include({ $source: 'defaults', value: 'OHTEST' })

    const channel = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/communication/vhf/channel`
    ).then((r) => r.json())
    expect(channel).to.include({ $source: 'defaults', value: 16 })
  })

  it('parent path is not itself a defaults-sourced leaf', async () => {
    await serverP
    // The original bug surfaced as a stale parent-path snapshot in
    // sources.defaults.communication: any later plugin-written child
    // (e.g. communication.crewNames) would appear duplicated in the
    // Data Browser, once on its own leaf row and once nested inside
    // the defaults-sourced parent blob.
    const res = await fetch(
      `http://localhost:${port}/signalk/v1/api/sources/defaults/communication`
    )
    if (res.status === 404) return
    expect(res.ok, `unexpected status ${res.status}`).to.equal(true)
    const body = await res.json()
    // If a `communication` entry exists under defaults, it must be a
    // container (no leaf-shape keys), not the whole subtree as one value.
    expect(body).to.not.have.property('value')
    expect(body).to.not.have.property('$source')
  })
})
