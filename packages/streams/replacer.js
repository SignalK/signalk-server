/*
 * Copyright 2020 Teppo Kurki <teppo.kurki@iki.fi>
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

require('util').inherits(Replacer, Transform)

function Replacer(options) {
  Transform.call(this, {
    objectMode: true
  })
  this.doPush = this.push.bind(this)
  this.regexp = new RegExp(options.regexp, 'gu')
  this.template = options.template
}

Replacer.prototype._transform = function (chunk, encoding, done) {
  const result = chunk.toString().replace(this.regexp, this.template)
  if (result.length > 0) {
    this.doPush(result)
  }
  done()
}

module.exports = Replacer

// const replacers = [
//   {
//     regexp: '\u0000',
//     template: '',
//     testdata: '\u0000$WIMWV,1\u000047,R,0,N,A21',
//     testresult: '$WIMWV,147,R,0,N,A21'
//   }
//   ,
//   {
//     regexp: '^...RMC.*',
//     template: '',
//     testdata: '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A',
//     testresult: ''
//   }
// ]

// replacers.forEach(replacerOptions => {
//   const replacer = new Replacer(replacerOptions)
//   replacer.doPush = x => console.log(JSON.stringify(x))
//   replacer._transform(replacerOptions.testdata, null, () => {})
// })
