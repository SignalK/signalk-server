const Transport = require('winston-transport')
const util = require('util')

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class LogStorageTransport extends Transport {
  constructor (app, opts) {
    super(opts)
    this.entries = []
    this.app = app
    this.size = opts.size || 100
  }

  log (info, callback) {
    setImmediate(() => {
      this.emit('logged', info)
    })

    this.entries.push(info)

    if (this.entries.length > this.size) {
      this.entries.splice(0, this.entries.length - this.size)
    }

    this.app.emit('serverevent', {
      type: 'LOG',
      data: info
    })

    callback()
  }
}
