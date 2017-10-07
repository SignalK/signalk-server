var chai = require("chai");
chai.Should();
chai.use(require('chai-things'));
chai.use(require('@signalk/signalk-schema').chaiModule);

var rp = require('request-promise');


var uuid = 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d';

var delta = {
  "context": "vessels." + uuid ,
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
      "src": "115",
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
      var host = 'http://localhost:' + freePort;
      var deltaUrl = host + '/signalk/v1/api/_test/delta';
      var restUrl = host + '/signalk/v1/api/';

      var p = startServerP(freePort)

      p.then(startedServer => {
        server = startedServer
        return rp({ url: deltaUrl, method: 'POST', json: delta })
      }).then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        var treeAfterFirstDelta = JSON.parse(body);
        treeAfterFirstDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.value', 43374);
        treeAfterFirstDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.$source', 'deltaFromHttp.115');
        treeAfterFirstDelta.should.be.validSignalK;

        delta.updates[0].values[0].value = 1;
        return rp({ url: deltaUrl, method: 'POST', json: delta })
      }).then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        var treeAfterSecondDelta = JSON.parse(body);
        treeAfterSecondDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.value', 1);
        treeAfterSecondDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.$source', 'deltaFromHttp.115');
        treeAfterSecondDelta.should.be.validSignalK;

        delta.updates[0].values[0].value = 2;
        delta.updates[0].source.src = "116";
        return rp({ url: deltaUrl, method: 'POST', json: delta })
      }).then(function(body) {
        return rp({ url: restUrl, method: 'GET'})
      }).then(function(body) {
        var treeAfterOtherSourceDelta = JSON.parse(body);
        treeAfterOtherSourceDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.value', 2);
        treeAfterOtherSourceDelta.vessels[uuid].should.have.deep.property('navigation.logTrip.$source', 'deltaFromHttp.116');
        treeAfterOtherSourceDelta.vessels[uuid].navigation.logTrip.values['deltaFromHttp.115'].value.should.equal(1);
        treeAfterOtherSourceDelta.vessels[uuid].navigation.logTrip.values['deltaFromHttp.116'].value.should.equal(2);
        treeAfterOtherSourceDelta.should.be.validSignalK;
      }).then( _ => {
        server.stop(done)
      }).catch( _ => {
        done()
      });

    })
  }).timeout(4000)
});

function startServerP(port) {
  const Server = require('../lib');
  const server = new Server({settings: './test/server-test-settings.json', port: port});
  return server.start();
}
