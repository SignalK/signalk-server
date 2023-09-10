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
let debug = require('debug')('signalk:streams:logging')
const fs = require('fs')
const { isUndefined } = require('lodash')

const filenamePattern = /skserver\-raw\_\d\d\d\d\-\d\d\-\d\dT\d\d\.log/
const loggers = {}

module.exports = {
  getLogger,
  getFullLogDir,
  listLogFiles,
}

class FileTimestampStreamWithDelete extends FileTimestampStream {
  constructor(app, fullLogDir, filesToKeep, options) {
    super(options)
    this.app = app
    this.filesToKeep = filesToKeep
    this.fullLogDir = fullLogDir
    this.prevFilename = undefined
    debug = (options.createDebug || require('debug'))('signalk:streams:logging')
  }

  // This method of base class is called when new file name is contemplated
  // So let's override it to check how many files are there and delete the oldest ones
  newFilename() {
    if (this.prevFilename !== this.currentFilename) {
      // Only do that after new file created
      this.prevFilename = this.currentFilename
      this.deleteOldFiles()
    }
    return super.newFilename()
  }

  deleteOldFiles() {
    debug(`Checking for old log files`)
    listLogFiles(this.app, (err, files) => {
      if (err) {
        console.error(err)
      } else {
        if (files.length > this.filesToKeep) {
          const sortedFiles = files.sort()
          const numToDelete = files.length - this.filesToKeep
          debug(`Will delete ${numToDelete} files`)
          for (let i = 0; i < numToDelete; i++) {
            const fileName = path.join(this.fullLogDir, sortedFiles[i])
            debug(`Deleting ${fileName}`)
            fs.unlink(fileName, (err) => {
              if (err) {
                console.error(err)
              } else {
                debug(`${fileName} was deleted`)
              }
            })
          }
        }
      }
    })
  }
}

function getLogger(app, discriminator = '', logdir) {
  const fullLogdir = getFullLogDir(app, logdir)

  if (!loggers[fullLogdir]) {
    const fileName = path.join(fullLogdir, 'skserver-raw_%Y-%m-%dT%H.log')

    debug(`logging to ${fileName}`)

    let fileTimestampStream
    if (
      isUndefined(app.config.settings.keepMostRecentLogsOnly) ||
      app.config.settings.keepMostRecentLogsOnly
    ) {
      // Delete old logs
      fileTimestampStream = new FileTimestampStreamWithDelete(
        app,
        fullLogdir,
        app.config.settings.logCountToKeep,
        { path: fileName }
      )
    } else {
      // Don't delete any logs
      fileTimestampStream = new FileTimestampStream({ path: fileName })
    }

    loggers[fullLogdir] = fileTimestampStream
  }

  const logger = loggers[fullLogdir]
  logger.on('error', (err) => {
    console.error(`Error opening data logging file: ${err.message}`)
  })

  return (msg) => {
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

function getFullLogDir(app, logdir) {
  if (!logdir) {
    logdir = app.config.settings.loggingDirectory || app.config.configPath
  }
  return path.isAbsolute(logdir)
    ? logdir
    : path.join(app.config.configPath, logdir)
}

function listLogFiles(app, cb) {
  fs.readdir(getFullLogDir(app), (err, files) => {
    if (!err) {
      cb(
        undefined,
        files.filter((filename) => filename.match(filenamePattern))
      )
    } else {
      cb(err)
    }
  })
}
