/*
 * Copyright 2026 Signal K and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
  promises as fsp
} from 'fs'
import type { FileHandle } from 'fs/promises'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'

/**
 * Prefix of the per-run directories that hold a source while it is compressed.
 * A directory that survives a crash is cleaned up by the logger once it is old.
 */
export const STAGING_DIR_PREFIX = '.compress-'

/**
 * Gzips `filePath` into `<filePath>.gz` and removes the original once the
 * compressed copy is complete. Resolves with the path of the compressed file.
 *
 * The source is renamed out of the way before it is read, into a directory
 * created for this run alone: nothing can reach it by name while the copy runs,
 * and a staging copy left behind by an interrupted run is never replaced. The
 * number of bytes that went into the archive is checked against the source size
 * afterwards, so a writer that opened the file before the rename cannot have
 * its records silently left out of the archive. If anything goes wrong the
 * source is put back without ever overwriting a file that appeared in the
 * meantime, and the archive is dropped, so a failed compression never costs a
 * record. An existing archive is never overwritten either: an hourly name can
 * come round again after a clock correction, and that earlier archive is the
 * only copy of its hour.
 */
export async function compressLogFile(filePath: string): Promise<string> {
  const compressedPath = `${filePath}.gz`
  const stagingDir = await fsp.mkdtemp(
    path.join(path.dirname(filePath), STAGING_DIR_PREFIX)
  )
  const stagingPath = path.join(stagingDir, path.basename(filePath))
  try {
    await fsp.rename(filePath, stagingPath)
  } catch (e) {
    await fsp.rmdir(stagingDir).catch(() => undefined)
    throw e
  }
  let claim: FileHandle
  try {
    // Claim the archive name exclusively before reading anything: if the open
    // fails, no byte has been read and the existing archive is untouched.
    claim = await fsp.open(compressedPath, 'wx')
  } catch (e) {
    await restoreSource(stagingPath, filePath, stagingDir)
    throw e
  }
  let sourceBytes = 0
  const countBytes = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sourceBytes += chunk.length
      callback(null, chunk)
    }
  })
  let failure: unknown
  try {
    await pipeline(
      createReadStream(stagingPath),
      countBytes,
      createGzip(),
      // autoClose: false, the handle below closes the descriptor. Letting the
      // stream close it leaves the FileHandle to close it again at GC time.
      createWriteStream(compressedPath, { fd: claim.fd, autoClose: false })
    )
    const source = await fsp.stat(stagingPath)
    if (source.size !== sourceBytes) {
      failure = new Error(
        `${stagingPath} grew while it was being compressed, keeping the source`
      )
    }
  } catch (e) {
    failure = e
  } finally {
    await claim.close().catch(() => undefined)
  }
  if (failure !== undefined) {
    // The archive was created by this call, so removing the partial copy
    // cannot touch an earlier one.
    await fsp.unlink(compressedPath).catch(() => undefined)
    await restoreSource(stagingPath, filePath, stagingDir)
    throw failure
  }
  await fsp.unlink(stagingPath)
  await fsp.rmdir(stagingDir).catch(() => undefined)
  return compressedPath
}

/**
 * Puts the staged source back under its own name, or leaves it staged if a
 * file has appeared there in the meantime. The placement is a single
 * non-overwriting operation, so a file created between a check and a rename
 * cannot be clobbered.
 */
async function restoreSource(
  stagingPath: string,
  filePath: string,
  stagingDir: string
): Promise<void> {
  try {
    try {
      // Fails with EEXIST rather than replacing an existing file.
      await fsp.link(stagingPath, filePath)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        throw e
      }
      // Filesystems without hard links (exFAT user data partitions, some
      // network shares): exclusive copy has the same non-overwriting
      // guarantee.
      await fsp.copyFile(stagingPath, filePath, fsConstants.COPYFILE_EXCL)
    }
    await fsp.unlink(stagingPath).catch(() => undefined)
    await fsp.rmdir(stagingDir).catch(() => undefined)
  } catch (e) {
    // The name is being written again; overwriting it would drop the new
    // records, so the staged copy stays where it is.
    console.error(
      `Kept ${stagingPath}: ${filePath} is in use again (${(e as Error).message})`
    )
  }
}

if (require.main === module) {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('usage: log-compressor <file>')
    process.exit(1)
  }
  compressLogFile(filePath).catch((e: Error) => {
    console.error(`Failed to compress ${filePath}: ${e.message}`)
    process.exit(1)
  })
}
