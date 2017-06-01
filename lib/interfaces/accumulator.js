/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

'use strict';


module.exports = function(app) {
  var accumulator = new Accumulator();
  var onDelta = accumulator.addDelta.bind(accumulator);

  var api = {};

  api.start = function() {
    app.signalk.on('delta', onDelta);
    setInterval(function() {
      console.log(JSON.stringify(accumulator.drain(), null, 2));
    }, 2000);
  };

  api.stop = function() {
    app.signalk.removeListener('delta', onDelta);
  };

  return api;
};


function Accumulator() {
  this.deltaFragments = {};
}

Accumulator.prototype.drain = function() {
  var fragments = this.deltaFragments;
  this.deltaFragments = {};
  return toDelta(fragments);
}

function toDelta(fragments) {
  var result = [];
  for (var context in fragments) {
    console.log(context)
    var delta = {
      context: context,
      updates: []
    };
    for (var path in fragments[context]) {
      delta.updates.push({
        source: fragments[context][path].source,
        values: [fragments[context][path].pathValue]
      })
    }
    result.push(delta);
  }
  return result;
}

Accumulator.prototype.addDelta = function(delta) {
  var context = this.deltaFragments[delta.context];
  if (!context) {
    this.deltaFragments[delta.context] = context = {};
  }
  var updateLen = delta.updates ? delta.updates.length : 0;
  for (var i = 0; i < updateLen; i++) {
    var pathValues = delta.updates[i].values;
    var pathValuesLen = pathValues.length;
    for (var j = 0; j < pathValuesLen; j++) {
      context[pathValues[j].path] = {
        pathValue: pathValues[j],
        source: delta.updates[i].source
      }
    }
  }
}
