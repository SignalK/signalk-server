const universal = require('./universal')

function MulitplexLog (options) {
  universal.call(this, { timestampThrottle: true, noLiner: true, ...options })
}

require('util').inherits(MulitplexLog, universal)

module.exports = universal
