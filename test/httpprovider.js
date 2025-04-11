/*
 * Copyright 015 Teppo Kurki <teppo.kurki@iki.fi>
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
const bodyParser = require('body-parser')

function HttpProvider(options) {
  Transform.call(this, {
    objectMode: true
  })
  options.app.use(bodyParser.json()) // for parsing application/json
  options.app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

  options.app.post('/signalk/v1/api/_test/delta', handleDelta.bind(this))
}

require('util').inherits(HttpProvider, Transform)

HttpProvider.prototype._transform = function (chunk, encoding, done) {
  console.error('HttpProvider._transform is not supposed to be called')
  done()
}

function handleDelta(req, res) {
  res.type('text/plain').send('ok')

  this.push(req.body)
}

module.exports = HttpProvider
