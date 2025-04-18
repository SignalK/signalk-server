/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Usage: This is the first pipeElement in a PipedProvider. Used to pass data input from Serial
 * to the next pipeElement.
 * Reads data from a serial device and allows writing back to serial with the "toStdout" option
 * It takes two options; "device" and "baudrate".
 *
 * The "toStdout" option is not mandatory. It routes events emitted on app with that name to
 * serial output, followed by newline. toStdout can be a string or an array of strings.
 *
 * You can run arbitrary shell command that get the configured serial port as the parameter
 * by setting the environment variable PRESERIALCOMMAND. The command is invoked once per each
 * configured serial port.
 *
 * For example running the server having run
 *
 * export PRESERIALCOMMAND="echo >>/tmp/serialports"
 *
 * will append all configured serial port devices to the file /tmp/serialports
 * every time the server is started.
 *
 * Example:

 {
   "type": "providers/serialport",
   "options": {
     "device": "/dev/ttyUSB0",
     "baudrate": 4800,
     "toStdout": "nmea0183out1"
   },
   "optionMappings": [
     {
       "fromAppProperty": "argv.nmeadevice",
       "toOption": "device"
     },

     {
       "fromAppProperty": "argv.nmeabaudrate",
       "toOption": "baudrate"
     }
   ]
 },

 */

import { Transform } from 'stream'
import { execSync } from 'child_process'
import shellescape from 'any-shell-escape'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { isArray, isBuffer } from 'lodash-es'
import createDebug from 'debug'
import { inherits } from 'util'

export default function SerialStream(options) {
  if (!(this instanceof SerialStream)) {
    return new SerialStream(options)
  }

  Transform.call(this, options)

  this.reconnect = options.reconnect || true
  this.reconnectDelay = 1000
  this.serial = null
  this.options = options
  this.maxPendingWrites = options.maxPendingWrites || 5
  this.start()
  this.isFirstError = true

  this.debug = (options.createDebug || createDebug)(
    'signalk:streams:serialport'
  )
}

inherits(SerialStream, Transform)

SerialStream.prototype.start = function () {
  const that = this

  if (this.serial !== null) {
    this.serial.unpipe(this)
    this.serial.removeAllListeners()
    this.serial = null
  }

  if (this.reconnect === false) {
    return
  }

  if (process.env.PRESERIALCOMMAND) {
    execSync(
      `${process.env.PRESERIALCOMMAND} ${shellescape(this.options.device)}`
    )
  }

  this.serial = new SerialPort({
    path: this.options.device,
    baudRate: this.options.baudrate,
  })

  this.serial.on(
    'open',
    function () {
      this.reconnectDelay = 1000
      this.options.app.setProviderStatus(
        this.options.providerId,
        `Connected to ${this.options.device}`
      )
      this.isFirstError = true
      const parser = new ReadlineParser()
      this.serial.pipe(parser).pipe(this)
    }.bind(this)
  )

  this.serial.on(
    'error',
    function (x) {
      this.options.app.setProviderError(this.options.providerId, x.message)
      if (this.isFirstError) {
        console.log(x.message)
      }
      this.debug(x.message)
      this.isFirstError = false
      this.scheduleReconnect()
    }.bind(this)
  )
  this.serial.on(
    'close',
    function () {
      this.options.app.setProviderError(
        this.options.providerId,
        'Closed, reconnecting...'
      )
      this.scheduleReconnect()
    }.bind(this)
  )

  let pendingWrites = 0
  const stdOutEvent = this.options.toStdout
  if (stdOutEvent) {
    ;(isArray(stdOutEvent) ? stdOutEvent : [stdOutEvent]).forEach((event) => {
      const onDrain = () => {
        pendingWrites--
      }

      that.options.app.on(event, (d) => {
        if (pendingWrites > that.maxPendingWrites) {
          that.debug('Buffer overflow, not writing:' + d)
          return
        }
        that.debug('Writing:' + d)
        if (isBuffer(d)) {
          that.serial.write(d)
        } else {
          that.serial.write(d + '\r\n')
        }
        setImmediate(() => {
          that.options.app.emit('connectionwrite', {
            providerId: that.options.providerId,
          })
        })
        pendingWrites++
        that.serial.drain(onDrain)
      })
    })
  }
}

SerialStream.prototype.end = function () {
  this.serial.close()
}

SerialStream.prototype._transform = function (chunk, encoding, done) {
  this.push(chunk)
  done()
}

SerialStream.prototype.scheduleReconnect = function () {
  this.reconnectDelay *= this.reconnectDelay < 60 * 1000 ? 1.5 : 1
  const msg = `Not connected (retry delay ${(
    this.reconnectDelay / 1000
  ).toFixed(0)} s)`
  this.debug(msg)
  this.options.app.setProviderStatus(this.options.providerId, msg)
  setTimeout(this.start.bind(this), this.reconnectDelay)
}
