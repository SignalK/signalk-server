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

/* Usage: this is the pipeElement that transforms NMEA0183 input to Signal K deltas
 * SelfId and selfType are fetched from app properties. Emits sentence data as "nmea0183"
 * events on app.signalk by default. Furthermore you can use "sentenceEvent" option,
 * that will cause sentence data to be emitted as events on app. sentenceEvent can
 * be a string or an array of strings.
 *
 * Example:

 {
   "type": "providers/nmea0183-signalk",
   "options": {
     "sentenceEvent": "nmea0183-1"
   },
   "optionMappings": [
     {
       "fromAppProperty": "selfId",
       "toOption": "selfId"
     },
     {
       "fromAppProperty": "selfType",
       "toOption": "selfType"
     }
   ]
 }

 */

const Transform = require("stream").Transform;
const isArray = require("lodash").isArray;


function ToSignalK(options) {
  Transform.call(this, {
    objectMode: true
  });

  this.parser = new (require("nmea0183-signalk")).Parser(options);

  var that = this;
  this.parser.on("nmea0183", function(sentence) {
    that.emit("nmea0183", sentence);
  });

  if (options.sentenceEvent) {
    (isArray(options.sentenceEvent)
      ? options.sentenceEvent
      : [options.sentenceEvent]).forEach(event => {
      that.parser.on("nmea0183", sentence => options.app.emit(event, sentence));
    });
  }

  this.parser.on("delta", function(delta) {
    if (that.timestamp) {
      delta.updates.forEach(update => {
        update.timestamp = that.timestamp;
      });
    }
    that.push(delta);
  });
}

require("util").inherits(ToSignalK, Transform);

ToSignalK.prototype._transform = function(chunk, encoding, done) {
  try {
    if (typeof chunk === "object" && typeof chunk.line === "string") {
      this.timestamp = new Date(Number(chunk.timestamp));
      this.parser.write(chunk.line + "\n");
    } else {
      this.parser.write(chunk + "\n");
    }
  } catch (ex) {
    console.error(ex);
  }
  done();
};

module.exports = ToSignalK;
