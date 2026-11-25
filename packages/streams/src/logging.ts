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
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { WriteStream } from 'fs'
import { finished } from 'stream/promises'
import { compressLogFile, STAGING_DIR_PREFIX } from './log-compressor'
import type { CreateDebug } from './types'

export interface LoggingApp {
  config: {
    configPath: string
    settings: {
      loggingDirectory?: string
      keepMostRecentLogsOnly?: boolean
      logCountToKeep?: number
      compressOldLogs?: boolean
    }
  }
}

let debug: (...args: unknown[]) => void = require('debug')(
  'signalk:streams:logging'
)

const filenamePattern = /skserver-raw_\d\d\d\d-\d\d-\d\dT\d\d\.log(\.gz)?$/
const loggers: Record<string, FileTimestampStream> = {}

export class FileTimestampStreamWithDelete extends FileTimestampStream {
  private readonly app: LoggingApp
  private readonly filesToKeep: number | undefined
  private readonly fullLogDir: string
  private readonly compressOldLogs: boolean
  private readonly queuedForCompression = new Set<string>()
  private notifiedRotationOf: string | undefined

  constructor(
    app: LoggingApp,
    fullLogDir: string,
    filesToKeep: number | undefined,
    options: { path: string; createDebug?: CreateDebug }
  ) {
    super(options)
    this.app = app
    this.filesToKeep = filesToKeep
    this.fullLogDir = fullLogDir
    this.compressOldLogs = app.config.settings.compressOldLogs !== false
    debug = (options.createDebug ?? require('debug'))('signalk:streams:logging')
  }

  newFilename(): string {
    const nextFilename = super.newFilename()
    const rotatedFilename = this.currentFilename
    if (
      rotatedFilename !== undefined &&
      rotatedFilename !== nextFilename &&
      rotatedFilename !== this.notifiedRotationOf
    ) {
      // The base class polls newFilename() every second, so only the first
      // call after the filename changes belongs to this rotation. this.stream
      // is still the stream of rotatedFilename: the base class ends it right
      // after this method returns.
      this.notifiedRotationOf = rotatedFilename
      this.onRotate(rotatedFilename, this.stream)
    }
    return nextFilename
  }

  private onRotate(filename: string, stream: WriteStream | undefined): void {
    this.deleteOldFiles()
    if (!this.compressOldLogs || this.queuedForCompression.has(filename)) {
      return
    }
    this.queuedForCompression.add(filename)
    const compress = () => this.compressOldFile(filename)
    if (stream && !stream.closed && !stream.writableFinished) {
      finished(stream).then(compress, compress)
    } else {
      compress()
    }
  }

  private compressOldFile(filename: string): void {
    const worker = path.join(__dirname, 'log-compressor.js')
    if (fs.existsSync(worker)) {
      try {
        const child = spawn(process.execPath, [worker, filename], {
          detached: true,
          // stderr stays attached: when the worker has to keep a staged copy it
          // says so there, and that message must not disappear.
          stdio: ['ignore', 'ignore', 'inherit']
        })
        // Without a listener an emitted 'error' would become an uncaught
        // exception and take the server down.
        child.on('error', (e: Error) => {
          debug(`Log compressor failed to start: ${e.message}`)
        })
        child.unref()
        return
      } catch (e) {
        debug(`Failed to spawn the log compressor: ${(e as Error).message}`)
      }
    }
    // Running from TypeScript sources, where no compiled worker exists.
    compressLogFile(filename).catch((e: Error) => {
      console.error(`Error compressing ${filename}: ${e.message}`)
    })
  }

  private deleteOldFiles(): void {
    debug('Checking for old log files')
    this.recoverStaleStagingDirs()
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

  /**
   * A compression run keeps its source in a directory of its own, so a run
   * that is killed leaves the records behind there instead of losing them.
   * Once such a directory is old enough that no run can still be using it, the
   * records are put back under their own name and compressed from there, which
   * is the same path a live run takes. Nothing is deleted: if the hour is in
   * use again the staged copy is kept, since it may be the only copy of those
   * records.
   */
  private recoverStaleStagingDirs(): void {
    const cutoff = Date.now() - 60 * 60 * 1000
    fs.readdir(this.fullLogDir, (err, names) => {
      if (err) {
        console.error(err)
        return
      }
      for (const name of names) {
        if (!name.startsWith(STAGING_DIR_PREFIX)) {
          continue
        }
        const dir = path.join(this.fullLogDir, name)
        fs.stat(dir, (statErr, stats) => {
          if (statErr || !stats.isDirectory() || stats.mtimeMs > cutoff) {
            return
          }
          this.recoverStagingDir(dir)
        })
      }
    })
  }

  private recoverStagingDir(dir: string): void {
    void (async () => {
      let names: string[]
      try {
        names = await fs.promises.readdir(dir)
      } catch (e) {
        console.error(e)
        return
      }
      const staged = names.filter((name) => name.endsWith('.log'))
      if (staged.length === 0) {
        debug(`Deleting empty staging directory ${dir}`)
        await fs.promises
          .rm(dir, { recursive: true, force: true })
          .catch((e: Error) => console.error(e))
        return
      }
      for (const name of staged) {
        const stagedPath = path.join(dir, name)
        const logPath = path.join(this.fullLogDir, name)
        try {
          // Fails with EEXIST rather than replacing a log file that exists.
          await fs.promises.link(stagedPath, logPath)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
            console.error(
              `Keeping ${stagedPath}: ${logPath} is in use again, the staged copy is left in place`
            )
            continue
          }
          try {
            // Filesystems without hard links: an exclusive copy has the same
            // non-overwriting guarantee.
            await fs.promises.copyFile(
              stagedPath,
              logPath,
              fs.constants.COPYFILE_EXCL
            )
          } catch (copyErr) {
            console.error(
              `Keeping ${stagedPath}: could not restore ${logPath} (${(copyErr as Error).message})`
            )
            continue
          }
        }
        debug(`Recovered ${stagedPath} as ${logPath}`)
        await fs.promises
          .unlink(stagedPath)
          .catch((e: Error) => console.error(e))
        this.compressOldFile(logPath)
      }
      const remaining = await fs.promises.readdir(dir).catch(() => ['?'])
      if (remaining.length === 0) {
        await fs.promises.rmdir(dir).catch(() => undefined)
      }
    })()
  }
}

export function getLogger(
  app: LoggingApp,
  discriminator = '',
  logdir?: string
): (msg: unknown) => void {
  const fullLogdir = getFullLogDir(app, logdir)

  if (!loggers[fullLogdir]) {
    const fileName = path.join(fullLogdir, 'skserver-raw_%Y-%m-%dT%H.log')

    debug(`logging to ${fileName}`)

    const keepOnlyRecent =
      app.config.settings.keepMostRecentLogsOnly === undefined ||
      app.config.settings.keepMostRecentLogsOnly
    const fileTimestampStream: FileTimestampStream =
      new FileTimestampStreamWithDelete(
        app,
        fullLogdir,
        keepOnlyRecent ? app.config.settings.logCountToKeep : undefined,
        { path: fileName }
      )

    loggers[fullLogdir] = fileTimestampStream
  }

  const logger = loggers[fullLogdir]
  logger.on('error', (err: Error) => {
    console.error(`Error opening data logging file: ${err.message}`)
  })

  return (msg: unknown) => {
    try {
      logger.write(
        Date.now() +
          ';' +
          discriminator +
          ';' +
          (typeof msg === 'object' && msg !== null && !Buffer.isBuffer(msg)
            ? JSON.stringify(msg)
            : String(msg)) +
          '\n'
      )
    } catch (e) {
      console.error(e)
    }
  }
}

export function getFullLogDir(app: LoggingApp, logdir?: string): string {
  const dir =
    logdir || app.config.settings.loggingDirectory || app.config.configPath
  return path.isAbsolute(dir) ? dir : path.join(app.config.configPath, dir)
}

export function listLogFiles(
  app: LoggingApp,
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
