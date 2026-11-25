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
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'

/**
 * Gzips `filePath` into `<filePath>.gz` and removes the original once the
 * compressed copy is complete. A partially written archive is removed on
 * failure, and the original is only dropped when the archive holds every byte
 * the source had when the copy started. Resolves with the path of the
 * compressed file.
 */
export async function compressLogFile(filePath: string): Promise<string> {
  const compressedPath = `${filePath}.gz`
  const before = await fsp.stat(filePath)
  try {
    await pipeline(
      createReadStream(filePath),
      createGzip(),
      createWriteStream(compressedPath)
    )
  } catch (e) {
    await fsp.unlink(compressedPath).catch(() => undefined)
    throw e
  }
  const after = await fsp.stat(filePath).catch(() => undefined)
  if (!after || after.size !== before.size) {
    // Records reached the file after the copy read it to the end, so the
    // archive is incomplete: keep the original and drop the archive.
    await fsp.unlink(compressedPath).catch(() => undefined)
    throw new Error(
      `${filePath} changed while it was being compressed, keeping the original`
    )
  }
  await fsp.unlink(filePath)
  return compressedPath
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
