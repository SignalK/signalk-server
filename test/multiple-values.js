var chai = require("chai");
chai.Should();
chai.use(require('chai-things'));

var schema = require('signalk-schema');

var rp = require('request-promise');


var uuid = 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d';

var delta = {
  "context": "vessels[" + uuid + "]",
  "updates": [
  {
    "source": {
      "pgn": 128275,
      "label" : "/dev/actisense",
      "timestamp": "2014-05-03T09:14:11.000Z",
      "src": "115"
    },
    "values": [
    { "path": "navigation.logTrip","value": 43374 },
    { "path": "navigation.log","value": 17404540 }
    ]
  },
  {
    "source": {
      "label" : "/dev/actisense",
      "timestamp":"2014-05-03T09:14:11.000Z",
      "src":"115",
      "pgn":128267
    },
    "values": [
    { "path": "navigation.courseOverGroundTrue", "value": 172.9 },
    { "path": "navigation.speedOverGround", "value": 3.85 }
    ]
  }
  ]
}


describe('Server', function() {
  it('handles two deltas with signalk path', function(done) {
    var fp = require("find-free-port")
    fp(3000, function(err, freePort) {
      var Server = require('../lib');

      var server = new Server({
        settings: './test/server-test-settings.json',
        port: freePort
      });

      server.start();

      var host = 'http://localhost:' + freePort;
      var deltaUrl = host + '/signalk/v1/api/_test/delta';
      var restUrl = host + '/signalk/v1/api/';
      var treeAfterFirstDelta;
      var treeAfterSecondDelta;
      var treeAfterOtherSourceDelta;

      rp({ url: deltaUrl, method: 'POST', json: delta })
      .then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        treeAfterFirstDelta = JSON.parse(body);

        delta.updates[0].values[0].value = 1;
        delta.updates[0].source.src = '116';
        return rp({ url: deltaUrl, method: 'POST', json: delta })
      }).then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        treeAfterSecondDelta = JSON.parse(body);

        delta.updates[0].src = 116
        return rp({ url: deltaUrl, method: 'POST', json: delta })
      }).then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        treeAfterOtherSourceDelta = JSON.parse(body);

      }).then(function() {
        treeAfterFirstDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.value', 43374);
        treeAfterFirstDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.$source', 'deltaFromHttp.115');
        treeAfterSecondDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.value', 1);
        treeAfterSecondDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.$source', 'deltaFromHttp.116');
        //TODO tests for 'values' values.


        var validationResult = schema.validateFull(treeAfterSecondDelta);
        if (!validationResult.valid) {
          console.log(JSON.stringify(treeAfterSecondDelta, null, 2));
          validationResult.errors.forEach(function(error) {
            console.error(error.message + "\n " + error.dataPath + "\n " + error.schemaPath);
          });
        }
        server.stop();
        done();
      });
    })
  })
});
