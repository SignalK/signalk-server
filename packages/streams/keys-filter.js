'use strict'

const Transform = require('stream').Transform
const debug = require('debug')('signalk-server-node/providers/keys-filter')

function ToSignalK (options) {
  Transform.call(this, {
    objectMode: true
  })

  this.exclude = options.excludeMatchingPaths
}

require('util').inherits(ToSignalK, Transform)

ToSignalK.prototype._transform = function (chunk, encoding, done) {
  // Chunck is a delta. Check options if any of the paths need to be filtered...
  let delta = null
  let string = false

  if (typeof chunk === 'object' && chunk !== null) {
    delta = chunk
  } else if (typeof chunk === 'string') {
    try {
      delta = JSON.parse(chunk)
      string = true
    } catch (e) {
      debug(`Error parsing chunk: ${e.message}`)
    }
  }

  if (Array.isArray(delta.updates)) {
    const updates = []
    delta.updates.forEach(update => {
      if (Array.isArray(update.values)) {
        const values = []

        update.values.forEach(value => {
          if (this.exclude.includes(value.path) !== true) {
            values.push(value)
          }
        })

        if (values.length > 0) {
          const upd = {
            values
          }

          if (update.hasOwnProperty('$source')) {
            upd.$source = update.$source
          }

          if (update.hasOwnProperty('source')) {
            upd.source = update.source
          }

          if (update.hasOwnProperty('timestamp')) {
            upd.timestamp = update.timestamp
          }

          updates.push(upd)
        }
      }
    })

    if (updates.length > 0) {
      delta.updates = updates

      if (string === true) {
        delta = JSON.stringify(delta)
      }

      this.push(delta)
    }
  }

  done()
}

module.exports = ToSignalK
