var _ = require('lodash');

var Dissolve = require("dissolve");
var Concentrate = require("concentrate");

var parser_129039 = Dissolve().loop(function(end) {
  this.buffer('messageIdAndRepeatIndicator', 1);
  this.uint32('mmsi');
  this.uint32('longitude');
  this.uint32('latitude');
  this.buffer('accuracyRaimTimestamp', 1);
  this.uint16('cog');
  this.uint16('sog');
  this.buffer('comms', 3);
  this.uint16('heading');
  this.buffer('regApp', 1);
  this.buffer('misc', 2);

  this.push(this.vars);
});

function parseHex(s) {
  return parseInt(s, 16)
};

var sampleData_129039 = "2014-08-15T19:00:00.363,4,129039,43,255,26,12,44,11,b6,0d,32,83,be,0e,5b,4f,99,23,03,ac,87,3e,01,06,00,26,ff,ff,00,74,ff";
sampleData_129039 = new Buffer(sampleData_129039.split(',').slice(6).map(parseHex), 'hex');

var template_129039 = undefined;
parser_129039.on("readable", function() {
  var e;
  while (e = parser_129039.read()) {
    if (e.messageIdAndRepeatIndicator) {
      template_129039 = e;
    }
  }
});
parser_129039.write(sampleData_129039);


var toActisenseSerialFormat = function(pgn, data) {
  return "2014-08-15T19:00:00.363,4," + pgn + ",43,255,26," +
    new Uint32Array(data).reduce(function(acc, i) {
      acc.push(i.toString(16));
      return acc;
    }, []).map(x => x.length === 1 ? '0' + x : x).join(',')
}


module.exports = function(app) {
  var api = {};

  api.start = function() {
    app.signalk.on('delta', function(delta) {
      if (delta.updates) {
        delta.updates.forEach(function(update) {
          if (update.source.pgn === 129039 || update.source.sentence === 'VDM') {
            var mapping = {
              'navigation.speedOverGround': [{
                from: 'value',
                to: 'sog'
              }],
              'navigation.courseOverGroundTrue': [{
                from: 'value',
                to: 'cog'
              }],
              'navigation.position': [{
                from: 'value.latitude',
                to: 'latitude'
              }, {
                from: 'value.longitude',
                to: 'longitude'
              }]
            }
            var holder = {};
            if (update.values) {
              update.values.forEach(function(pathValue) {
                if (mapping[pathValue.path]) {
                  mapping[pathValue.path].forEach(function(fromTo) {
                    try {
                      holder[fromTo.to] = _.get(pathValue, fromTo.from);
                    } catch (e) {
                      console.error(e)
                    }
                  })
                  delete mapping[pathValue.path];
                }
              });
              try {
                if (Object.getOwnPropertyNames(mapping).length === 0) {
                  var data = Concentrate()
                    .buffer(template_129039.messageIdAndRepeatIndicator)
                    .uint32(delta.context.split(':')[4])
                    .int32((holder.longitude * 10000000).toFixed(0))
                    .int32((holder.latitude * 10000000).toFixed(0))
                    .buffer(template_129039.accuracyRaimTimestamp)
                    .uint16((holder.cog * 10000).toFixed(0))
                    .uint16((holder.sog * 100).toFixed(0))
                    .buffer(template_129039.comms)
                    .uint16(template_129039.heading)
                    .buffer(template_129039.regApp)
                    .buffer(template_129039.misc)
                    .result();
                  var result = toActisenseSerialFormat(129039, data);
                  // console.log(result);
                  app.emit('pgnout', result);
                }
              } catch (ex) {
                console.log(ex.stack)
              }
            }
          }
        });
      }
    });
  };

  api.stop = function() {
    app.signalk.removeListener(onDelta);
  };

  return api;
};


function Accumulator() {
  this.deltaFragments = {};
}
