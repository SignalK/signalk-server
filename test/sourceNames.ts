import { expect } from 'chai'
import { buildSourceNames, wsSourceRef } from '../src/sourceNames'

// WebSocket device sources authenticate as `ws.<clientId>` and carry the
// device's registration description as their human-readable name. The map
// served at GET /sourceNames merges those with any admin-set manual alias.

describe('wsSourceRef', function () {
  it('prefixes with ws. and leaves a UUID clientId intact', function () {
    expect(wsSourceRef('3d3e48a1-1185-2fe3-c494-1c1a9ee6f41f')).to.equal(
      'ws.3d3e48a1-1185-2fe3-c494-1c1a9ee6f41f'
    )
  })

  it('replaces dots so the ref stays a single label suffix', function () {
    expect(wsSourceRef('host.local')).to.equal('ws.host_local')
  })
})

describe('buildSourceNames', function () {
  it('maps ws device refs to their description', function () {
    const names = buildSourceNames(
      [
        {
          clientId: '3d3e48a1-1185-2fe3-c494-1c1a9ee6f41f',
          description: 'sensesp-engines'
        }
      ],
      {}
    )
    expect(names['ws.3d3e48a1-1185-2fe3-c494-1c1a9ee6f41f']).to.equal(
      'sensesp-engines'
    )
  })

  it('skips devices without a description', function () {
    const names = buildSourceNames([{ clientId: 'abc' }], {})
    expect(names).to.deep.equal({})
  })

  it('lets manual aliases override device descriptions', function () {
    const names = buildSourceNames(
      [{ clientId: 'abc', description: 'auto-name' }],
      { 'ws.abc': 'My Sensor', 'YDEN02.37': 'My Charger' }
    )
    expect(names['ws.abc']).to.equal('My Sensor')
    expect(names['YDEN02.37']).to.equal('My Charger')
  })
})
