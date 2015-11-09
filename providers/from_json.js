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

var Transform = require('stream').Transform;

function FromJson() {
  Transform.call(this, {
    objectMode: true
  });
}

require('util').inherits(FromJson, Transform);

FromJson.prototype._transform = function(chunk, encoding, done) {
  try {
    this.push(JSON.parse(chunk.toString()));
  } catch (ex) {
    console.error("Could not parse JSON:" + chunk.toString());
  }
  done();
}

module.exports = FromJson;