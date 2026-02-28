import { describe, it, expect } from 'vitest'
import {
  parseSourceRef,
  getDeviceInfo,
  buildSourceLabel,
  buildSourceLabelMap,
  detectInstanceConflicts,
  type SourcesData,
  type N2kDeviceEntry
} from './sourceLabels'

// Realistic sources API response shape (subset of a real server)
const sourcesData: SourcesData = {
  YDEN02: {
    type: 'NMEA2000',
    '44': {
      n2k: {
        src: '44',
        manufacturerCode: 'Furuno',
        canName: '00:11:22:33:44:55:66:77'
      }
    },
    '37': {
      n2k: {
        src: '37',
        manufacturerCode: 'Victron Energy',
        modelId: 'SmartSolar Charger MPPT 100/50'
      }
    },
    '73': {
      n2k: {
        src: '73',
        manufacturerCode: 'Maretron'
        // no modelId
      }
    },
    '226': {
      n2k: {
        src: '226',
        manufacturerCode: 'Victron Energy',
        modelId: 'Quattro 24/8000/200-2x100'
      }
    },
    '99': {
      n2k: {
        src: '99'
        // no manufacturer, no model
      }
    }
  },
  SERIAL1: {
    type: 'NMEA0183',
    sentences: ['RMC', 'GGA']
  }
}

describe('parseSourceRef', () => {
  it('parses N2K sourceRef into connection and src', () => {
    expect(parseSourceRef('YDEN02.44')).toEqual({
      connection: 'YDEN02',
      src: '44'
    })
  })

  it('splits on first dot only (connection names do not contain dots)', () => {
    expect(parseSourceRef('some.host.99')).toEqual({
      connection: 'some',
      src: 'host.99'
    })
  })

  it('returns null for plugin sources without a dot', () => {
    expect(parseSourceRef('derived-data')).toBeNull()
    expect(parseSourceRef('autopilot')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSourceRef('')).toBeNull()
  })
})

describe('getDeviceInfo', () => {
  it('returns n2k info for a known N2K device', () => {
    const info = getDeviceInfo('YDEN02.44', sourcesData)
    expect(info).toEqual({
      src: '44',
      manufacturerCode: 'Furuno',
      canName: '00:11:22:33:44:55:66:77'
    })
  })

  it('returns null for plugin sources', () => {
    expect(getDeviceInfo('derived-data', sourcesData)).toBeNull()
  })

  it('returns null for unknown connection', () => {
    expect(getDeviceInfo('UNKNOWN.44', sourcesData)).toBeNull()
  })

  it('returns null for unknown src address on known connection', () => {
    expect(getDeviceInfo('YDEN02.999', sourcesData)).toBeNull()
  })

  it('returns null for NMEA0183 sources (no n2k sub-object)', () => {
    expect(getDeviceInfo('SERIAL1.sentences', sourcesData)).toBeNull()
  })
})

describe('buildSourceLabel', () => {
  it('shows manufacturer + model when both available', () => {
    expect(buildSourceLabel('YDEN02.37', sourcesData)).toBe(
      'Victron Energy SmartSolar Charger MPPT 100/50 (YDEN02.37)'
    )
    expect(buildSourceLabel('YDEN02.226', sourcesData)).toBe(
      'Victron Energy Quattro 24/8000/200-2x100 (YDEN02.226)'
    )
  })

  it('shows manufacturer only when no model', () => {
    expect(buildSourceLabel('YDEN02.44', sourcesData)).toBe(
      'Furuno (YDEN02.44)'
    )
    expect(buildSourceLabel('YDEN02.73', sourcesData)).toBe(
      'Maretron (YDEN02.73)'
    )
  })

  it('returns raw sourceRef when no manufacturer and no model', () => {
    expect(buildSourceLabel('YDEN02.99', sourcesData)).toBe('YDEN02.99')
  })

  it('returns raw sourceRef for plugin sources', () => {
    expect(buildSourceLabel('derived-data', sourcesData)).toBe('derived-data')
  })

  it('returns raw sourceRef when sourcesData is null', () => {
    expect(buildSourceLabel('YDEN02.44', null)).toBe('YDEN02.44')
  })

  it('returns raw sourceRef for unknown connections', () => {
    expect(buildSourceLabel('UNKNOWN.1', sourcesData)).toBe('UNKNOWN.1')
  })
})

describe('buildSourceLabelMap', () => {
  it('builds a map of enriched labels for all known N2K devices', () => {
    const map = buildSourceLabelMap(sourcesData)

    // Device 44 has canName, so sourceRef uses it
    expect(map.get('YDEN02.00:11:22:33:44:55:66:77')).toBe(
      'Furuno (YDEN02.00:11:22:33:44:55:66:77)'
    )
    // Devices without canName fall back to numeric address
    expect(map.get('YDEN02.37')).toBe(
      'Victron Energy SmartSolar Charger MPPT 100/50 (YDEN02.37)'
    )
    expect(map.get('YDEN02.73')).toBe('Maretron (YDEN02.73)')
    expect(map.get('YDEN02.226')).toBe(
      'Victron Energy Quattro 24/8000/200-2x100 (YDEN02.226)'
    )
  })

  it('excludes devices with no useful metadata', () => {
    const map = buildSourceLabelMap(sourcesData)
    expect(map.has('YDEN02.99')).toBe(false)
  })

  it('excludes non-N2K sources', () => {
    const map = buildSourceLabelMap(sourcesData)
    const serial1Keys = [...map.keys()].filter((k) => k.startsWith('SERIAL1'))
    expect(serial1Keys).toHaveLength(0)
  })

  it('returns empty map for empty sourcesData', () => {
    const map = buildSourceLabelMap({})
    expect(map.size).toBe(0)
  })
})

describe('detectInstanceConflicts', () => {
  const makeDevice = (
    overrides: Partial<N2kDeviceEntry> & {
      sourceRef: string
      connection: string
    }
  ): N2kDeviceEntry => ({
    src: '0',
    ...overrides
  })

  it('returns no conflicts when devices have different instances', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0,
        pgns: { '127505': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 1,
        pgns: { '127505': '' }
      })
    ]
    expect(detectInstanceConflicts(devices)).toHaveLength(0)
  })

  it('detects conflict when two devices share instance and PGNs', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0,
        pgns: { '127505': '', '130312': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 0,
        pgns: { '127505': '', '127506': '' }
      })
    ]
    const conflicts = detectInstanceConflicts(devices)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].deviceInstance).toBe(0)
    expect(conflicts[0].sharedPGNs).toEqual(['127505'])
    expect(conflicts[0].deviceA.sourceRef).toBe('C.1')
    expect(conflicts[0].deviceB.sourceRef).toBe('C.2')
  })

  it('returns no conflict when devices share instance but have disjoint PGNs', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0,
        pgns: { '127505': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 0,
        pgns: { '130312': '' }
      })
    ]
    expect(detectInstanceConflicts(devices)).toHaveLength(0)
  })

  it('handles devices with no pgns', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 0
      })
    ]
    expect(detectInstanceConflicts(devices)).toHaveLength(0)
  })

  it('skips devices with undefined deviceInstance', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        pgns: { '127505': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        pgns: { '127505': '' }
      })
    ]
    expect(detectInstanceConflicts(devices)).toHaveLength(0)
  })

  it('ignores protocol/management PGNs (every device sends those)', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0,
        pgns: { '60928': '', '126996': '', '126993': '', '59904': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 0,
        pgns: { '60928': '', '126996': '', '126993': '', '59904': '' }
      })
    ]
    expect(detectInstanceConflicts(devices)).toHaveLength(0)
  })

  it('detects conflict on data PGNs even when protocol PGNs also overlap', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 0,
        pgns: { '60928': '', '126996': '', '127505': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 0,
        pgns: { '60928': '', '126996': '', '127505': '' }
      })
    ]
    const conflicts = detectInstanceConflicts(devices)
    expect(conflicts).toHaveLength(1)
    // Only the data PGN should be listed, not protocol PGNs
    expect(conflicts[0].sharedPGNs).toEqual(['127505'])
  })

  it('detects multiple conflicts in a group of three', () => {
    const devices: N2kDeviceEntry[] = [
      makeDevice({
        sourceRef: 'C.1',
        connection: 'C',
        src: '1',
        deviceInstance: 5,
        pgns: { '130312': '' }
      }),
      makeDevice({
        sourceRef: 'C.2',
        connection: 'C',
        src: '2',
        deviceInstance: 5,
        pgns: { '130312': '' }
      }),
      makeDevice({
        sourceRef: 'C.3',
        connection: 'C',
        src: '3',
        deviceInstance: 5,
        pgns: { '130312': '' }
      })
    ]
    // 3 devices → 3 pairs: (1,2), (1,3), (2,3)
    expect(detectInstanceConflicts(devices)).toHaveLength(3)
  })
})
