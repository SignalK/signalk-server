/*
 * Copyright 2019 Scott Bender <scott@scottbender.net>
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

/* Usage:
 *  This is part of a PipedProvider that splits the input into separate lines and passes one line at a time to the next provider.
 *  You can specify the line separator with the option lineSeparator.

 {
   "type": "providers/splitting-liner"
 },

 */

const Transform = require('stream').Transform

require('util').inherits(SplittingLiner, Transform)

function SplittingLiner(options) {
  Transform.call(this, {
    objectMode: true
  })
  this.doPush = this.push.bind(this)
  this.lineSeparator = options.lineSeparator || '\n'
}

SplittingLiner.prototype._transform = function (chunk, encoding, done) {
  const data = chunk.toString()
  const lines = data.split(this.lineSeparator)
  lines.forEach(this.doPush)
  done()
}

module.exports = SplittingLiner
