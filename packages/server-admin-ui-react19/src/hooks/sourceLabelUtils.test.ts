import { describe, it, expect } from 'vitest'
import { getSourceDisplayLabel } from './sourceLabelUtils'

describe('sourceLabelUtils', () => {
  it('uses n2k description for nested ws source refs', () => {
    const sources = {
      ws: {
        myDevice: {
          n2k: {
            description: 'Cabin Tablet'
          }
        }
      }
    }

    expect(getSourceDisplayLabel('ws.myDevice.n2k.204', sources)).toBe(
      'Cabin Tablet'
    )
  })

  it('falls back to sourceRef when ws n2k description is missing', () => {
    const sources = {
      ws: {
        myDevice: {
          description: 'Top-level only'
        }
      }
    }

    expect(getSourceDisplayLabel('ws.myDevice.n2k.204', sources)).toBe(
      'ws.myDevice.n2k.204'
    )
  })

  it('falls back to sourceRef for non-ws source refs', () => {
    const sources = {
      nmea0183: {
        tcp: {
          description: 'NMEA tcp'
        }
      }
    }

    expect(getSourceDisplayLabel('nmea0183.tcp', sources)).toBe('nmea0183.tcp')
  })
})
