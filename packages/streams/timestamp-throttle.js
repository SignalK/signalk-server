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

import { Transform } from 'stream'
import moment from 'moment'
import { inherits } from 'util'

/*
This Transformer throttles the stream based on the stream's timestamp properties
so that throughput rate is real time. Aimed at canboat analyzer output
rate control
*/

export default function TimestampThrottle(options) {
  Transform.call(this, {
    objectMode: true,
  })
  this.lastMsgMillis = new Date().getTime()
  this.getMilliseconds =
    options && options.getMilliseconds
      ? options.getMilliseconds
      : getMilliseconds
}

inherits(TimestampThrottle, Transform)

TimestampThrottle.prototype._transform = function (msg, encoding, done) {
  const msgMillis = this.getMilliseconds(msg)
  if (msgMillis < this.lastMsgMillis) {
    this.offsetMillis = new Date().getTime() - msgMillis
  }
  this.lastMsgMillis = msgMillis
  const millisToCorrectSendTime = msgMillis - Date.now() + this.offsetMillis
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
