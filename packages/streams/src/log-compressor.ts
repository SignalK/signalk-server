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

import { createReadStream, createWriteStream, promises as fsp } from 'fs'
import type { FileHandle } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'

/**
 * Gzips `filePath` into `<filePath>.gz` and removes the original once the
 * compressed copy is complete. Resolves with the path of the compressed file.
 *
 * The source is renamed out of the way before it is read, so nothing can open
 * it and append while the copy runs, and no byte written to the original name
 * can be lost between the last read and the removal. If anything goes wrong
 * the source is put back and the archive is dropped, so a failed compression
 * never costs a record. An existing archive is never overwritten: an hourly
 * name can come round again after a clock correction, and that earlier archive
 * is the only copy of its hour.
 */
export async function compressLogFile(filePath: string): Promise<string> {
  const compressedPath = `${filePath}.gz`
  const stagingPath = `${filePath}.compressing`
  await fsp.rename(filePath, stagingPath)
  let claim: FileHandle
  try {
    // Claim the archive name exclusively before reading anything: if the open
    // fails, no byte has been read and the existing archive is untouched.
    claim = await fsp.open(compressedPath, 'wx')
  } catch (e) {
    await restoreSource(stagingPath, filePath)
    throw e
  }
  try {
    await pipeline(
      createReadStream(stagingPath),
      createGzip(),
      // autoClose: false, the handle below closes the descriptor. Letting the
      // stream close it leaves the FileHandle to close it again at GC time.
      createWriteStream(compressedPath, { fd: claim.fd, autoClose: false })
    )
  } catch (e) {
    // The archive was created by this call, so removing the partial copy
    // cannot touch an earlier one.
    await fsp.unlink(compressedPath).catch(() => undefined)
    await restoreSource(stagingPath, filePath)
    throw e
  } finally {
    await claim.close().catch(() => undefined)
  }
  await fsp.unlink(stagingPath)
  return compressedPath
}

async function restoreSource(
  stagingPath: string,
  filePath: string
): Promise<void> {
  const inUseAgain = await fsp.access(filePath).then(
    () => true,
    () => false
  )
  if (inUseAgain) {
    // The name is being written again; overwriting it with the staged copy
    // would drop the new records, so the staged file stays where it is.
    console.error(`Kept ${stagingPath}: ${filePath} is in use again`)
    return
  }
  await fsp
    .rename(stagingPath, filePath)
    .catch((e: Error) =>
      console.error(`Could not restore ${filePath}: ${e.message}`)
    )
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
