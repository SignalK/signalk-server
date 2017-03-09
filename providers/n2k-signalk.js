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

const Transform = require('stream').Transform
const toDelta = require('n2k-signalk').toDelta
const debug = require('debug')('signalk:provider:n2k-signalk')

require('util').inherits(ToSignalK, Transform);

function ToSignalK(options) {
  Transform.call(this, {
    objectMode: true
  });
  this.srcCannames = {}
  this.app = options.app
  this.ignoreUnknownSrcs = typeof options.ignoreUnknownSrcs === "undefined" ? false : options.ignoreUnknownSrcs
}


ToSignalK.prototype._transform = function(analyzerJson, encoding, done) {
  try {
    if(analyzerJson.pgn === 60928) {
      this.srcCannames[analyzerJson.src] = analyzerJson.fields
    } else {
      var delta = toDelta(analyzerJson);
      if(delta && delta.updates[0].values.length > 0) {
        //reduceRight, because we may modify the array while iterating
        //and remaining indices do not change this way
        delta.updates.reduceRight((acc, update, i) => {
          if(update.source && update.source.src && this.srcCannames[update.source.src]) {
            update.source.manufacturerCode = this.srcCannames[update.source.src]['Manufacturer Code']
            update.source.uniqueNumber = this.srcCannames[update.source.src]['Unique Number']
          } else {
            const isoRequest = new Date().toISOString() + ',6,59904,0,' + analyzerJson.src.toString() + ',3,0,ee,00'
            debug('ISO Request:' + isoRequest)
            this.app.emit('nmea2000out', isoRequest)
            if(this.ignoreUnknownSrcs) {
              debug("Delta with no can name available ignored:" + JSON.stringify(delta.updates.splice(i, 1)))
            }
          }
        }, [])
        this.push(delta);
      }
    }
  } catch(ex) {
    console.error(ex);
  }
  done();
}


module.exports = ToSignalK;
