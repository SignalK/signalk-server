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

/*  Usage:
 * As part of a PipedProvider in a settings file. Lets the server read from a file, as set in the options:
 * Example from https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-file-settings.json#L23-L34

{
 "type": "providers/filestream",
 "options": {
   "filename": "samples/plaka.log"
 },
 "optionMappings": [
   {
     "fromAppProperty": "argv.nmeafilename",
     "toOption": "filename"
   }
 ]
},

 */

import path from 'path'
import { PassThrough } from 'stream'
import { createReadStream, existsSync } from 'fs'
import { inherits } from 'util'

function EndIgnoringPassThrough() {
  PassThrough.call(this)
}

inherits(EndIgnoringPassThrough, PassThrough)
EndIgnoringPassThrough.prototype.end = function () {}

export default function FileStream(options) {
  this.options = options
  this.keepRunning =
    typeof options.keepRunning === 'undefined' ? true : options.keepRunning
}

FileStream.prototype.pipe = function (pipeTo) {
  this.pipeTo = pipeTo
  this.endIgnoringPassThrough = new EndIgnoringPassThrough()
  this.endIgnoringPassThrough.pipe(pipeTo)
  this.startStream()
}

FileStream.prototype.startStream = function () {
  let filename
  if (path.isAbsolute(this.options.filename)) {
    filename = this.options.filename
  } else {
    filename = path.join(
      this.options.app.config.configPath,
      this.options.filename
    )
    if (!existsSync(filename)) {
      filename = path.join(__dirname, '..', this.options.filename)
    }
  }

  this.filestream = createReadStream(filename)
  this.filestream.on('error', (err) => {
    console.error(err.message)
    this.keepRunning = false
  })
  if (this.keepRunning) {
    this.filestream.on('end', this.startStream.bind(this))
  }
  this.filestream.pipe(this.endIgnoringPassThrough)
}

FileStream.prototype.end = function () {
  this.pipeTo.end()
  this.filestream.close()
}
