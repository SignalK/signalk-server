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

function N2KAnalyzer(options) {
  Transform.call(this, {
    objectMode: true
  })

  this.analyzerOutEvent = options.analyzerOutEvent || 'N2KAnalyzerOut'

  if (process.platform === 'win32') {
    this.analyzerProcess = require('child_process').spawn('cmd', [
      '/c',
      'analyzer -json -si -camel'
    ])
  } else {
    this.analyzerProcess = require('child_process').spawn('sh', [
      '-c',
      'analyzer -json -si -camel'
    ])
  }
  this.analyzerProcess.stderr.on('data', function (data) {
    console.error(data.toString())
  })
  this.analyzerProcess.on('close', function (code) {
    console.error('Analyzer process exited with code ' + code)
  })

  this.linereader = require('readline').createInterface(
    this.analyzerProcess.stdout,
    this.analyzerProcess.stdin
  )
  const that = this
  this.linereader.on('line', function (data) {
    try {
      let parsed = JSON.parse(data)
      if (parsed.version) {
        console.log('Connected to analyzer v' + parsed.version)
        return
      }
      that.push(parsed)
      options.app.emit(that.analyzerOutEvent, parsed)
    } catch (ex) {
      console.error(data)
      console.error(ex.stack)
    }
  })
}

require('util').inherits(N2KAnalyzer, Transform)

N2KAnalyzer.prototype._transform = function (chunk, encoding, done) {
  this.analyzerProcess.stdin.write(chunk.toString() + '\n')
  done()
}
N2KAnalyzer.prototype.pipe = function (pipeTo) {
  this.pipeTo = pipeTo
  N2KAnalyzer.super_.prototype.pipe.call(this, pipeTo)
}

N2KAnalyzer.prototype.end = function () {
  console.log('end, killing child analyzer process')
  this.analyzerProcess.kill()
  this.pipeTo.end()
}

module.exports = N2KAnalyzer
