var Bacon = require('baconjs');

var StreamBundle = require('../streambundle');

module.exports = function(app) {
  var api = {};

  var streamBundle = new StreamBundle();

  api.start = function() {
    app.signalk.on('delta', streamBundle.pushDelta.bind(streamBundle));

    function mapToNmea(f, s1, s2) {
      Bacon.combineWith(f, streamBundle.getStream(s1), streamBundle.getStream(s1))
        .changes()
        .debounceImmediate(20)
        .onValue(nmeaString => {
          app.signalk.emit('nmea0183', nmeaString)
        });
    }

    mapToNmea(mwv, 'environment.wind.angleApparent', 'environment.wind.speedApparent');
  };

  api.stop = function() {
    app.signalk.removeListener(onDelta);
  };

  return api;
};


/*
=== MWV - Wind Speed and Angle ===

------------------------------------------------------------------------------
        1   2 3   4 5
        |   | |   | |
 $--MWV,x.x,a,x.x,a*hh<CR><LF>
------------------------------------------------------------------------------

Field Number:

1. Wind Angle, 0 to 360 degrees
2. Reference, R = Relative, T = True
3. Wind Speed
4. Wind Speed Units, K/M/N
5. Status, A = Data Valid
6. Checksum
*/

function mwv(speed, angle) {
  var data = [
    '$SKMWV',
    angle,
    'R',
    speed,
    'M',
    'A'
  ].join(',')
  return data + computeChecksum(data);
};

var m_hex = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

function computeChecksum(sentence) {
  var c1;
  var i;

  // skip the $
  i = 1;

  // init to first character    var count;

  c1 = sentence.charCodeAt(i);

  // process rest of characters, zero delimited
  for (i = 2; i < sentence.length; ++i) {
    c1 = c1 ^ sentence.charCodeAt(i);
  }

  return '*' + toHexString(c1);
};


function toHexString(v) {
  var lsn;
  var msn;

  msn = (v >> 4) & 0x0f;
  lsn = (v >> 0) & 0x0f;
  return m_hex[msn] + m_hex[lsn];
};
