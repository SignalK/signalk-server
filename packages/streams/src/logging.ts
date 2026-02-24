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

import FileTimestampStream from 'file-timestamp-stream'
import path from 'path'
import fs from 'fs'
import { CreateDebug, StreamsApp } from './types'

let debug: (...args: unknown[]) => void = require('debug')(
  'signalk:streams:logging'
)

const filenamePattern = /skserver-raw_\d\d\d\d-\d\d-\d\dT\d\d\.log/
const loggers: Record<string, FileTimestampStream> = {}

interface LogMessage {
  updates?: unknown[]
}

class FileTimestampStreamWithDelete extends FileTimestampStream {
  private readonly app: StreamsApp
  private readonly filesToKeep: number | undefined
  private readonly fullLogDir: string
  private prevFilename: string | undefined

  constructor(
    app: StreamsApp,
    fullLogDir: string,
    filesToKeep: number | undefined,
    options: { path: string; createDebug?: CreateDebug }
  ) {
    super(options)
    this.app = app
    this.filesToKeep = filesToKeep
    this.fullLogDir = fullLogDir
    this.prevFilename = undefined
    debug = (options.createDebug ?? require('debug'))('signalk:streams:logging')
  }

  newFilename(): string {
    if (this.prevFilename !== this.currentFilename) {
      this.prevFilename = this.currentFilename
      this.deleteOldFiles()
    }
    return super.newFilename()
  }

  private deleteOldFiles(): void {
    debug('Checking for old log files')
    listLogFiles(this.app, (err, files) => {
      if (err) {
        console.error(err)
      } else if (
        files &&
        this.filesToKeep !== undefined &&
        files.length > this.filesToKeep
      ) {
        const sortedFiles = files.sort()
        const numToDelete = files.length - this.filesToKeep
        debug(`Will delete ${numToDelete} files`)
        for (let i = 0; i < numToDelete; i++) {
          const fileName = path.join(this.fullLogDir, sortedFiles[i]!)
          debug(`Deleting ${fileName}`)
          fs.unlink(fileName, (unlinkErr) => {
            if (unlinkErr) {
              console.error(unlinkErr)
            } else {
              debug(`${fileName} was deleted`)
            }
          })
        }
      }
    })
  }
}

export function getLogger(
  app: StreamsApp,
  discriminator = '',
  logdir?: string
): (msg: unknown) => void {
  const fullLogdir = getFullLogDir(app, logdir)

  if (!loggers[fullLogdir]) {
    const fileName = path.join(fullLogdir, 'skserver-raw_%Y-%m-%dT%H.log')

    debug(`logging to ${fileName}`)

    let fileTimestampStream: FileTimestampStream
    if (
      app.config.settings.keepMostRecentLogsOnly === undefined ||
      app.config.settings.keepMostRecentLogsOnly
    ) {
      fileTimestampStream = new FileTimestampStreamWithDelete(
        app,
        fullLogdir,
        app.config.settings.logCountToKeep,
        { path: fileName }
      )
    } else {
      fileTimestampStream = new FileTimestampStream({ path: fileName })
    }

    loggers[fullLogdir] = fileTimestampStream
  }

  const logger = loggers[fullLogdir]
  logger.on('error', (err: Error) => {
    console.error(`Error opening data logging file: ${err.message}`)
  })

  return (msg: unknown) => {
    try {
      const logMsg = msg as LogMessage
      logger.write(
        Date.now() +
          ';' +
          discriminator +
          ';' +
          (logMsg.updates ? JSON.stringify(msg) : String(msg)) +
          '\n'
      )
    } catch (e) {
      console.error(e)
    }
  }
}

export function getFullLogDir(app: StreamsApp, logdir?: string): string {
  const dir =
    logdir || app.config.settings.loggingDirectory || app.config.configPath
  return path.isAbsolute(dir) ? dir : path.join(app.config.configPath, dir)
}

export function listLogFiles(
  app: StreamsApp,
  cb: (err: NodeJS.ErrnoException | undefined, files?: string[]) => void
): void {
  fs.readdir(getFullLogDir(app), (err, files) => {
    if (!err) {
      cb(
        undefined,
        files.filter((filename) => filenamePattern.test(filename))
      )
    } else {
      cb(err)
    }
  })
}
