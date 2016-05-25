var Bacon = require('baconjs');
var Qty = require('js-quantities');
var signalkSchema = require('signalk-schema');

var conversions = {
  "rad": Qty.swiftConverter('rad', 'deg'),
  "K": Qty.swiftConverter("tempK", "tempC")
}

function StreamBundle() {
  this.buses = {};
  this.streams = {};
  this.pathValues = new Bacon.Bus();
}

StreamBundle.prototype.pushDelta = function(delta) {
  if (delta.updates) {
    delta.updates.forEach(update => {
      if (update.values) {
        update.values.forEach(pathValue => {
          this.push(pathValue);
        }, this)
      }
    }, this);
  }
}

StreamBundle.prototype.push = function(pathValue) {
  this.pathValues.push(pathValue);
  this.getBus(pathValue.path).push(pathValue.value);
}

StreamBundle.prototype.getBus = function(path) {
  var result = this.buses[path];
  if (!result) {
    result = this.buses[path] = new Bacon.Bus();
    this.streams[path] = result.debounceImmediate(200);
  }
  return result;
}

StreamBundle.prototype.getStream = function(path) {
  var result = this.streams[path];
  if (!result) {
    this.buses[path] = new Bacon.Bus();
    result = this.streams[path] = this.buses[path].debounceImmediate(200);
    if (signalkSchema.metadata[path] && conversions[signalkSchema.metadata[path].units]) {
      result = this.streams[path] = this.streams[path].map(conversions[signalkSchema.metadata[path].units]);
    }

  }
  return result;
}

module.exports = StreamBundle;
