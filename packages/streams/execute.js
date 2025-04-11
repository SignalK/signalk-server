/*
 *
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>,
 * Teppo Kurki <teppo.kurki@iki.fi> *et al*.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/* Usage:
 * As part of a PipedProvider in a settings file. Lets you pass a command to the server, as set in the options.
 * Also allows writing to stdout, for example with actisense-serial N2K data
 * see https://github.com/tkurki/cassiopeia-settings/blob/master/signalk-server-settings.json
 * Example from https://github.com/SignalK/signalk-server-node/blob/master/settings/actisense-serial-settings.json#L12

  {
   "type": "providers/execute",
      "options": {
        "command": "actisense-serial /dev/tty.usbserial-1FD34"
      }
  }

 *
 * It may also be other commands such as "./aisdeco --gain 33.8 --freq-correction 60 --freq 161975000 --freq 162025000 --net 30007 --udp 5.9.207.224:5351" for starting an AID reception with a USB SRD dongle
 */

const Transform = require('stream').Transform
const { pgnToActisenseSerialFormat } = require('@canboat/canboatjs')

function Execute(options) {
  Transform.call(this, {})
  this.options = options
  const createDebug = options.createDebug || require('debug')
  this.debug = options.debug || createDebug('signalk:streams:execute')
}

require('util').inherits(Execute, Transform)

Execute.prototype._transform = function (chunk, encoding, done) {
  this.analyzerProcess.stdin.write(chunk.toString())
  done()
}
function start(command, that) {
  that.debug(`starting |${command}|`)
  if (process.platform === 'win32') {
    that.childProcess = require('child_process').spawn('cmd', ['/c', command])
  } else {
    that.childProcess = require('child_process').spawn('sh', ['-c', command])
  }
  that.lastStartupTime = new Date().getTime()
  that.options.app.setProviderStatus(that.options.providerId, 'Started')

  that.childProcess.stderr.on('data', function (data) {
    const msg = data.toString()
    that.options.app.setProviderError(that.options.providerId, msg)
    console.error(msg)
  })

  that.childProcess.stdout.on('data', function (data) {
    if (that.debug.enabled) {
      that.debug(data.toString())
    }
    that.push(data)
  })

  that.childProcess.on('close', (code) => {
    const msg = `|${command}| exited with ${code}`
    // that.options.app.setProviderError(that.options.providerId, msg)
    console.error(msg)
    if (
      typeof that.options.restartOnClose === 'undefined' ||
      that.options.restartOnClose
    ) {
      const throttleTime = (that.options.restartThrottleTime || 60) * 1000

      const sinceLast = new Date().getTime() - that.lastStartupTime
      if (sinceLast > throttleTime) {
        start(command, that)
      } else {
        const nextStart = throttleTime - sinceLast
        const msg = `Waiting ${nextStart / 1000} seconds to restart`
        that.options.app.setProviderStatus(that.options.providerId, msg)
        that.debug(msg)
        setTimeout(function () {
          start(command, that)
        }, nextStart)
      }
    }
  })
}

Execute.prototype.pipe = function (pipeTo) {
  this.pipeTo = pipeTo
  start(this.options.command, this)

  const stdOutEvent = this.options.toChildProcess || 'toChildProcess'
  this.debug(
    'Using event ' + stdOutEvent + " for output to child process's stdin"
  )
  const that = this
  that.options.app.on(stdOutEvent, function (d) {
    try {
      that.childProcess.stdin.write(d + '\n')
    } catch (err) {
      console.log('execute:' + err.message)
    }
  })

  if (stdOutEvent === 'nmea2000out') {
    that.options.app.on('nmea2000JsonOut', (pgn) => {
      that.childProcess.stdin.write(pgnToActisenseSerialFormat(pgn) + '\r\n')
    })
    that.options.app.emit('nmea2000OutAvailable')
  }

  Execute.super_.prototype.pipe.call(this, pipeTo)
}

Execute.prototype.end = function () {
  this.debug('end, killing child  process')
  this.childProcess.kill()
  this.pipeTo.end()
}

module.exports = Execute
