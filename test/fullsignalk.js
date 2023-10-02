import chai from 'chai'
chai.should()
// chai.use(require('../lib/').chaiModule);

var FullSignalK = require('../lib/fullsignalk');
import signalkSchema from '@signalk/signalk-schema'


describe('FullSignalK', function() {
  it('Delta with object value should produce full tree leaf without the .value', function() {
    var delta = {
      "updates": [{
        "source": {
          "label": "n2kFromFile",
          "type": "NMEA2000",
          "pgn": 129038,
          "src": "43"
        },
        "timestamp": "2014-08-15T19:03:21.532Z",
        "values": [{
          "path": "navigation.speedOverGround",
          "value": 7.09
        }, {
          "path": "navigation.courseOverGroundTrue",
          "value": 4.8171
        }, {
          "path": "navigation.position",
          "value": {
            "longitude": 25.4398883,
            "latitude": 59.969895
          }
        }]
      }],
      "context": "vessels.foo"
    };
    var fullSignalK = new FullSignalK();
    fullSignalK.addDelta(delta);
    fullSignalK.retrieve().vessels.foo.navigation.position.value.should.have.property('longitude');
    fullSignalK.retrieve().vessels.foo.navigation.position.should.have.property('$source');
  })

  it('Two deltas from different sources results in values structure', function() {
    var delta = {
      "updates": [{
        "source": {
          "label": "n2kFromFile",
          "type": "NMEA2000",
          "pgn": 129038,
          "src": "43"
        },
        "timestamp": "2014-08-15T19:03:21.532Z",
        "values": [{
          "path": "navigation.speedOverGround",
          "value": 7.09
        }]
      }],
      "context": "vessels.foo"
    };
    var fullSignalK = new FullSignalK();
    fullSignalK.addDelta(delta);
    delta.updates[0].source.src = 48;
    delta.updates[0].values[0].value = 8;
    fullSignalK.addDelta(delta);
    fullSignalK.retrieve().vessels.foo.navigation.speedOverGround.should.have.property('value', 8);
    fullSignalK.retrieve().vessels.foo.navigation.speedOverGround.should.have.property('$source');
    fullSignalK.retrieve().vessels.foo.navigation.speedOverGround.values['n2kFromFile.43'].should.have.property('value', 7.09);
    fullSignalK.retrieve().vessels.foo.navigation.speedOverGround.values['n2kFromFile.48'].should.have.property('value', 8);
  })

  it('AIS delta produces valid Signal K', function() {
    var aisDelta = {
      "updates": [{
        "source": {
          "label": "N2K-1",
          "type": "NMEA2000",
          "pgn": 129038,
          "src": "43"
        },
        "timestamp": "2014-08-15T19:00:15.402Z",
        "values": [{
          "path": "navigation.speedOverGround",
          "value": 14.81
        }, {
          "path": "navigation.courseOverGroundTrue",
          "value": 3.4889
        }, {
          "path": "navigation.position",
          "value": {
            "longitude": 24.8142433,
            "latitude": 59.865655
          }
        }]
      }],
      "context": "vessels.urn:mrn:imo:mmsi:276780000"
    };
    var fullSignalK = new FullSignalK("urn:mrn:imo:mmsi:276799999", "mmsi");
    fullSignalK.addDelta(aisDelta);
    fullSignalK.retrieve().should.be.validSignalK;

  })

  it('Delta with empty path sets content under root', function() {
    var msg = {
      "updates": [{
        "source": {
          "label": "n2kFromFile",
          "type": "NMEA2000",
          "pgn": 129794,
          "src": "43"
        },
        "timestamp": "2014-08-15T19:02:31.507Z",
        "values": [{
          "path": "",
          "value": {
            "name": "WRANGO"
          }
        }]
      }],
      "context": "vessels.urn:mrn:imo:mmsi:276810000"
    }
    var fullSignalK = new FullSignalK();
    fullSignalK.addDelta(msg);
    var vessel = fullSignalK.retrieve().vessels['urn:mrn:imo:mmsi:276810000'];
    vessel.should.have.property('name', "WRANGO");
    vessel.should.not.have.property('$source');
    vessel.should.not.have.property('timestamp');
    vessel.should.not.have.property('pgn');
  })

  it('Delta with instance produces proper sources hierarchy', function() {

    var msg = {
      "updates": [{
        "source": {
          "label": "N2K",
          "type": "NMEA2000",
          "pgn": 130312,
          "src": "36",
          "instance": "0"
        },
        "timestamp": "2015-01-15T16:15:19.628Z",
        "values": [{
          "path": "environment.water.temperature",
          "value": 15.2
        }]
      }],
      "context": "vessels.urn:mrn:imo:mmsi:276810000"
    }
    var fullSignalK = new FullSignalK();
    fullSignalK.addDelta(msg);
    var full = fullSignalK.retrieve();
    var vessel = full.vessels['urn:mrn:imo:mmsi:276810000'];
    vessel.environment.water.temperature.should.have.property('value', 15.2);
    full.sources.should.have.property('N2K');
    full.sources['N2K'].should.have.property('36');
    full.sources['N2K']['36'].should.have.property('0');
  })

  it('Delta with $source produces sources hierarchy and correct $source reference', function() {

    var msg =   {
      "context": "vessels.urn:mrn:imo:mmsi:276810000",
      "updates": [{
        "$source": "1W.0316013faeff",
        "values": [{
          "path": "propulsion.engine1.temperature",
          "value": 301.837
        }]
      }]
    }

    var fullSignalK = new FullSignalK();
    fullSignalK.addDelta(msg);
    var full = fullSignalK.retrieve();
    full.sources.should.have.property('1W');
    full.sources['1W'].should.have.property('0316013faeff');
    var vessel = full.vessels['urn:mrn:imo:mmsi:276810000'];
    vessel.propulsion.engine1.temperature.should.have.property('$source', '1W.0316013faeff')
  })

  it('MMSI self is set correctly in full tree', function() {
    var fullSignalK = new FullSignalK('urn:mrn:imo:mmsi:276810000', null, {});
    fullSignalK.retrieve().self.should.equal('vessels.urn:mrn:imo:mmsi:276810000')
  })

  it('UUID self is set correctly in full tree', function() {
    var fullSignalK = new FullSignalK('urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d', null, {});
    fullSignalK.retrieve().self.should.equal('vessels.urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d')
  })

  it('Generates valid SignalK even when it adds some meta information', () => {
    const delta = { "updates": [
      {
        "source":{"label":"","type":"NMEA2000","pgn":129029,"src":"3"},
        "timestamp":"2017-04-15T15:50:48.664Z",
        "values": [
          {"path":"navigation.position","value":{"longitude":-76.3972731,"latitude":39.0536632}},
          {"path":"navigation.gnss.antennaAltitude","value":1},
          {"path":"navigation.gnss.satellites","value":18},
          {"path":"navigation.gnss.horizontalDilution","value":0.73},
          {"path":"navigation.gnss.positionDilution","value":1.2},
          {"path":"navigation.gnss.geoidalSeparation","value":-0.01},
          {"path":"navigation.gnss.differentialAge","value":30},
          {"path":"navigation.gnss.differentialReference","value":22},
          {"path":"navigation.gnss.type","value":"Combined GPS/GLONASS"},
          {"path":"navigation.gnss.methodQuality","value":"GNSS Fix"},
          {"path":"navigation.gnss.integrity","value":"no Integrity checking"}
        ]
      }
    ]}

    const fullSignalK = new FullSignalK('urn:mrn:imo:mmsi:276810000', null, {});
    if (!delta.context) {
      delta.context = 'vessels.' + signalkSchema.fakeMmsiId
    }
    fullSignalK.addDelta(delta);

    const full = fullSignalK.retrieve()
    full.should.be.validSignalK
  })
})
