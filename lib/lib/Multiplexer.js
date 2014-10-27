var events  = require("events")
  , _       = require("lodash")
;

function Multiplexer() {
  this.lastSignalK  = null;
  this.signalK      = null;
  this.lastChange   = -1;
}

require("util").inherits(Multiplexer, events.EventEmitter);

Multiplexer.prototype.add = function (data) {
  var self = this;

  if(this.signalK !== null) {
    this.lastSignalK = _.clone(this.signalK, true);
  }

  process.nextTick(function () {
    if (self.signalK !== null) {
      self.signalK = _.merge(self.signalK, data);
    } else {
      self.signalK = _.merge({}, data);
    }

    if (self.hasChanged()) {
      self.lastChange = Date.now();
      self.emit('change', data);
    }
  });
};

Multiplexer.prototype.retrieve = function () {
  return _.clone(this.signalK, true);
};

Multiplexer.prototype.hasChanged = function () {
  if (this.signalK === null) return false;
  if (this.lastSignalK === null) return true;

  if (this.lastChange === -1 || (Date.now() - this.lastChange) > 30000) {
    return true;
  }

  return !(_.isEqual(this.signalK, this.lastSignalK));
};

module.exports = Multiplexer;