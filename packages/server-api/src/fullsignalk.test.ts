import { expect } from 'chai'
import { FullSignalK } from './fullsignalk'

describe('FullSignalK', function () {
  it('Delta with object value should produce full tree leaf without the .value', function () {
    const delta = {
      updates: [
        {
          source: {
            label: 'n2kFromFile',
            type: 'NMEA2000',
            pgn: 129038,
            src: '43'
          },
          timestamp: '2014-08-15T19:03:21.532Z',
          values: [
            {
              path: 'navigation.speedOverGround',
              value: 7.09
            },
            {
              path: 'navigation.courseOverGroundTrue',
              value: 4.8171
            },
            {
              path: 'navigation.position',
              value: {
                longitude: 25.4398883,
                latitude: 59.969895
              }
            }
          ]
        }
      ],
      context: 'vessels.foo'
    }
    const fullSignalK = new FullSignalK()
    fullSignalK.addDelta(delta)
    const full = fullSignalK.retrieve()
    expect(full.vessels.foo.navigation.position.value).to.have.property(
      'longitude'
    )
    expect(full.vessels.foo.navigation.position).to.have.property('$source')
  })

  it('Two deltas from different sources results in values structure', function () {
    const delta = {
      updates: [
        {
          source: {
            label: 'n2kFromFile',
            type: 'NMEA2000',
            pgn: 129038,
            src: '43'
          },
          timestamp: '2014-08-15T19:03:21.532Z',
          values: [
            {
              path: 'navigation.speedOverGround',
              value: 7.09
            }
          ]
        }
      ],
      context: 'vessels.foo'
    }
    const fullSignalK = new FullSignalK()
    fullSignalK.addDelta(delta)
    delta.updates[0]!.source.src = '48'
    delta.updates[0]!.values[0]!.value = 8
    fullSignalK.addDelta(delta)
    const sog = fullSignalK.retrieve().vessels.foo.navigation.speedOverGround
    expect(sog).to.have.property('value', 8)
    expect(sog).to.have.property('$source')
    expect(sog.values['n2kFromFile.43']).to.have.property('value', 7.09)
    expect(sog.values['n2kFromFile.48']).to.have.property('value', 8)
  })

  it('AIS delta produces Signal K tree with expected shape', function () {
    const aisDelta = {
      updates: [
        {
          source: {
            label: 'N2K-1',
            type: 'NMEA2000',
            pgn: 129038,
            src: '43'
          },
          timestamp: '2014-08-15T19:00:15.402Z',
          values: [
            {
              path: 'navigation.speedOverGround',
              value: 14.81
            },
            {
              path: 'navigation.courseOverGroundTrue',
              value: 3.4889
            },
            {
              path: 'navigation.position',
              value: {
                longitude: 24.8142433,
                latitude: 59.865655
              }
            }
          ]
        }
      ],
      context: 'vessels.urn:mrn:imo:mmsi:276780000'
    }
    const fullSignalK = new FullSignalK('urn:mrn:imo:mmsi:276799999', 'mmsi')
    fullSignalK.addDelta(aisDelta)
    const full = fullSignalK.retrieve()
    const vessel = full.vessels['urn:mrn:imo:mmsi:276780000']
    expect(vessel.navigation.speedOverGround).to.have.property('value', 14.81)
    expect(vessel.navigation.courseOverGroundTrue).to.have.property(
      'value',
      3.4889
    )
    expect(vessel.navigation.position.value).to.deep.equal({
      longitude: 24.8142433,
      latitude: 59.865655
    })
  })

  it('Delta with empty path sets content under root', function () {
    const msg = {
      updates: [
        {
          source: {
            label: 'n2kFromFile',
            type: 'NMEA2000',
            pgn: 129794,
            src: '43'
          },
          timestamp: '2014-08-15T19:02:31.507Z',
          values: [
            {
              path: '',
              value: {
                name: 'WRANGO'
              }
            }
          ]
        }
      ],
      context: 'vessels.urn:mrn:imo:mmsi:276810000'
    }
    const fullSignalK = new FullSignalK()
    fullSignalK.addDelta(msg)
    const vessel = fullSignalK.retrieve().vessels['urn:mrn:imo:mmsi:276810000']
    expect(vessel).to.have.property('name', 'WRANGO')
    expect(vessel).to.not.have.property('$source')
    expect(vessel).to.not.have.property('timestamp')
    expect(vessel).to.not.have.property('pgn')
  })

  it('Delta with instance produces proper sources hierarchy', function () {
    const msg = {
      updates: [
        {
          source: {
            label: 'N2K',
            type: 'NMEA2000',
            pgn: 130312,
            src: '36',
            instance: '0'
          },
          timestamp: '2015-01-15T16:15:19.628Z',
          values: [
            {
              path: 'environment.water.temperature',
              value: 15.2
            }
          ]
        }
      ],
      context: 'vessels.urn:mrn:imo:mmsi:276810000'
    }
    const fullSignalK = new FullSignalK()
    fullSignalK.addDelta(msg)
    const full = fullSignalK.retrieve()
    const vessel = full.vessels['urn:mrn:imo:mmsi:276810000']
    expect(vessel.environment.water.temperature).to.have.property('value', 15.2)
    expect(full.sources).to.have.property('N2K')
    expect(full.sources['N2K']).to.have.property('36')
    expect(full.sources['N2K']['36']).to.have.property('0')
  })

  it('Delta with $source produces sources hierarchy and correct $source reference', function () {
    const msg = {
      context: 'vessels.urn:mrn:imo:mmsi:276810000',
      updates: [
        {
          $source: '1W.0316013faeff',
          values: [
            {
              path: 'propulsion.engine1.temperature',
              value: 301.837
            }
          ]
        }
      ]
    }
    const fullSignalK = new FullSignalK()
    fullSignalK.addDelta(msg)
    const full = fullSignalK.retrieve()
    expect(full.sources).to.have.property('1W')
    expect(full.sources['1W']).to.have.property('0316013faeff')
    const vessel = full.vessels['urn:mrn:imo:mmsi:276810000']
    expect(vessel.propulsion.engine1.temperature).to.have.property(
      '$source',
      '1W.0316013faeff'
    )
  })

  it('MMSI self is set correctly in full tree', function () {
    const fullSignalK = new FullSignalK(
      'urn:mrn:imo:mmsi:276810000',
      undefined,
      {}
    )
    expect(fullSignalK.retrieve().self).to.equal(
      'vessels.urn:mrn:imo:mmsi:276810000'
    )
  })

  it('UUID self is set correctly in full tree', function () {
    const fullSignalK = new FullSignalK(
      'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d',
      undefined,
      {}
    )
    expect(fullSignalK.retrieve().self).to.equal(
      'vessels.urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
    )
  })

  it('Generates expected Signal K tree even when it adds some meta information', function () {
    const delta = {
      context: 'vessels.urn:mrn:imo:mmsi:276810000',
      updates: [
        {
          source: {
            label: '',
            type: 'NMEA2000',
            pgn: 129029,
            src: '3'
          },
          timestamp: '2017-04-15T15:50:48.664Z',
          values: [
            {
              path: 'navigation.position',
              value: { longitude: -76.3972731, latitude: 39.0536632 }
            },
            { path: 'navigation.gnss.antennaAltitude', value: 1 },
            { path: 'navigation.gnss.satellites', value: 18 },
            { path: 'navigation.gnss.horizontalDilution', value: 0.73 },
            { path: 'navigation.gnss.positionDilution', value: 1.2 },
            { path: 'navigation.gnss.geoidalSeparation', value: -0.01 },
            { path: 'navigation.gnss.differentialAge', value: 30 },
            { path: 'navigation.gnss.differentialReference', value: 22 },
            { path: 'navigation.gnss.type', value: 'Combined GPS/GLONASS' },
            { path: 'navigation.gnss.methodQuality', value: 'GNSS Fix' },
            {
              path: 'navigation.gnss.integrity',
              value: 'no Integrity checking'
            }
          ]
        }
      ]
    }

    const fullSignalK = new FullSignalK(
      'urn:mrn:imo:mmsi:276810000',
      undefined,
      {}
    )
    fullSignalK.addDelta(delta)
    const full = fullSignalK.retrieve()
    const vessel = full.vessels['urn:mrn:imo:mmsi:276810000']
    expect(vessel.navigation.position.value).to.deep.equal({
      longitude: -76.3972731,
      latitude: 39.0536632
    })
    expect(vessel.navigation.gnss.satellites).to.have.property('value', 18)
    expect(vessel.navigation.gnss.type).to.have.property(
      'value',
      'Combined GPS/GLONASS'
    )
  })
})

describe('Sources in delta', function () {
  const deltaWithMiscSources = {
    context: 'vessels.urn:mrn:imo:mmsi:200000000',
    updates: [
      {
        source: {
          sentence: 'HDT',
          label: '0183-1',
          talker: 'II'
        },
        timestamp: '2016-08-03T07:55:57.000Z',
        values: [{ path: 'navigation.headingTrue', value: 0.2231 }]
      },
      {
        source: {
          src: '37',
          pgn: 127251,
          label: 'N2000-01'
        },
        timestamp: '2016-06-20T10:33:36Z',
        values: [{ path: 'navigation.rateOfTurn', value: 0.108908 }]
      },
      {
        $source: '1W.0316013faeff',
        timestamp: '2016-07-28T18:18:46.074Z',
        values: [{ path: 'propulsion.engine1.temperature', value: 301.837 }]
      },
      {
        $source: 'i2c-0.0x48.volts',
        timestamp: '2016-07-28T18:18:46.074Z',
        values: [{ path: 'electrical.batteries.house.voltage', value: 12.837 }]
      },
      {
        $source: 'i2c-0.0x48.amps',
        timestamp: '2016-07-28T18:18:46.074Z',
        values: [{ path: 'electrical.batteries.house.current', value: -0.837 }]
      },
      {
        timestamp: '2016-08-03T07:55:57.000Z',
        values: [{ path: 'navigation.headingTrue', value: 0.2231 }]
      }
    ]
  }

  it('build the expected sources hierarchy', function () {
    const fullSignalK = new FullSignalK('urn:mrn:imo:mmsi:200000000')
    fullSignalK.addDelta(deltaWithMiscSources)
    const full = fullSignalK.retrieve()
    expect(full.sources['0183-1']['II'].talker).to.equal('II')
    expect(full.sources['N2000-01']['37']['n2k']['src']).to.equal('37')
    expect(full.sources['i2c-0']['0x48']).to.exist
    expect(full.sources['1W']['0316013faeff']).to.exist
  })
})

describe('Delta with source.instance', function () {
  it('produces valid full tree', function () {
    const delta = {
      context: 'vessels.urn:mrn:imo:mmsi:200000000',
      updates: [
        {
          source: {
            label: 'aLabel',
            type: 'NMEA2000',
            pgn: 130312,
            src: '41',
            instance: '5'
          },
          timestamp: '2015-01-15T16:15:18.136Z',
          values: [
            {
              path: 'environment.inside.engineRoom.temperature',
              value: 70
            }
          ]
        }
      ]
    }

    const fullSignalK = new FullSignalK('urn:mrn:imo:mmsi:200000000')
    fullSignalK.addDelta(delta)
    const full = fullSignalK.retrieve()
    const vessel = full.vessels['urn:mrn:imo:mmsi:200000000']
    expect(vessel.environment.inside.engineRoom.temperature).to.have.property(
      'value',
      70
    )
    expect(full.sources).to.have.property('aLabel')
    expect(full.sources['aLabel']['41']).to.have.property('5')
  })
})
