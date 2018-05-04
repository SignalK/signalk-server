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

const FileTimestampStream = require('file-timestamp-stream')
const path = require('path')
const debug = require('debug')('signalk:logging')

const loggers = {}

module.exports = (app, discriminator, logdir) => {
  if (!logdir) {
    logdir = app.config.settings.loggingDirectory || app.config.configPath
  }

  var discriminator = discriminator || ''

  const fullLogdir =
    logdir.charAt(0) !== '/' ? path.join(app.config.configPath, logdir) : logdir

  if (!loggers[fullLogdir]) {
    const fileName = path.join(fullLogdir, 'signalk-rawdata.log.%Y-%m-%dT%H')

    debug(`logging to ${fileName}`)

    loggers[fullLogdir] = new FileTimestampStream({
      path: fileName
    })
  }
  var logger = loggers[fullLogdir]

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
