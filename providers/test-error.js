var Transform = require('stream').Transform;

function ToSignalK(options) {
  Transform.call(this, {
    objectMode: true
  })

  this.start = Date.now()
}

require('util').inherits(ToSignalK, Transform);

ToSignalK.prototype._transform = function(chunk, encoding, done) {
  if ((Date.now() - this.start) > 10000) {
    return done(new Error('TEST ERROR'))
  }

  this.push(chunk)
  done()
}

module.exports = ToSignalK;
