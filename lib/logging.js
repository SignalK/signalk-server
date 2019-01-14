/*
 * Copyright 2017 Scott Bender (scott@scottbender.net)
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

const { FileTimestampStream } = require('file-timestamp-stream')
const path = require('path')
const debug = require('debug')('signalk:logging')
const fs = require('fs')

const filenamePattern = /skserver\-raw\_\d\d\d\d\-\d\d\-\d\dT\d\d\.log/
const loggers = {}

module.exports = {
  getLogger,
  getFullLogDir,
  listLogFiles
}

function getLogger (app, discriminator = '', logdir) {
  const fullLogdir = getFullLogDir(app, logdir)

  if (!loggers[fullLogdir]) {
    const fileName = path.join(fullLogdir, 'skserver-raw_%Y-%m-%dT%H.log')

    debug(`logging to ${fileName}`)

    loggers[fullLogdir] = new FileTimestampStream({
      path: fileName
    })
  }
  const logger = loggers[fullLogdir]
  logger.on('error', err => {
    console.error(`Error opening data logging file: ${err.message}`)
  })

  return msg => {
    try {
      logger.write(
        Date.now() +
          ';' +
          discriminator +
          ';' +
          (msg.updates ? JSON.stringify(msg) : msg.toString()) +
          '\n'
      )
    } catch (e) {
      console.error(e)
    }
  }
}

function getFullLogDir (app, logdir) {
  if (!logdir) {
    logdir = app.config.settings.loggingDirectory || app.config.configPath
  }
  return path.isAbsolute(logdir)
    ? logdir
    : path.join(app.config.configPath, logdir)
}

function listLogFiles (app, cb) {
  fs.readdir(getFullLogDir(app), (err, files) => {
    if (!err) {
      cb(undefined, files.filter(filename => filename.match(filenamePattern)))
    } else {
      cb(err)
    }
  })
}
