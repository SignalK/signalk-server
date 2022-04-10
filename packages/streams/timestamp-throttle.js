/*
 * Copyright 2015 Teppo Kurki <teppo.kurki@ıki.fi>
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

const Transform = require('stream').Transform
const moment = require('moment')

/*
This Transformer throttles the stream based on the stream's timestamp properties
so that throughput rate is real time. Aimed at canboat analyzer output
rate control
*/

function TimestampThrottle(options) {
  Transform.call(this, {
    objectMode: true,
  })
  this.lastMsgMillis = new Date().getTime()
  this.getMilliseconds =
    options && options.getMilliseconds
      ? options.getMilliseconds
      : getMilliseconds
  this.adjustTimestamp = false
  if (options) {
    if (options.adjustTimestamp === true) {
      this.adjustTimestamp = adjustTimestamp
    }
    else {
      this.adjustTimestamp = options.adjustTimestamp
    }
  }
}

require('util').inherits(TimestampThrottle, Transform)

TimestampThrottle.prototype._transform = function (msg, encoding, done) {
  const msgMillis = this.getMilliseconds(msg)
  if (msgMillis < this.lastMsgMillis) {
    this.offsetMillis = new Date().getTime() - msgMillis
    this.firstOffsetMillis = this.offsetMillis
  }
  this.lastMsgMillis = msgMillis
  const millisToCorrectSendTime = msgMillis - Date.now() + this.offsetMillis
  if (this.adjustTimestamp) {
    msg.timestamp = (new Date(this.adjustTimestamp(msgMillis, this.firstOffsetMillis))).toISOString();
  }
  if (millisToCorrectSendTime <= 0) {
    this.push(msg)
    done()
  } else {
    const doPush = this.push.bind(this, msg)
    setTimeout(function () {
      doPush()
      done()
    }, millisToCorrectSendTime)
  }
}

function getMilliseconds(msg) {
  // 2014-08-15-16:00:00.083
  return moment(msg.timestamp, 'YYYY-MM-DD-HH:mm:ss.SSS').valueOf()
}


/**
 * Adjust timestamp in message retrieved from log
 *
 * Usually, to shift timestamps into the current moment.
 *
 * @param {number} msgMillis timestamp of current message, in millis
 * @param {number} offsetMillis difference between timestamp in first message of playback and system time at that time, in millis
 * @returns {number} timestamp, to assign to message, in millis.
 */
function adjustTimestamp(msgMillis, offsetMillis) {
  return msgMillis + offsetMillis;
}

module.exports = TimestampThrottle
