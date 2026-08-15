import { randomBytes } from 'crypto'
import fs from 'fs'

const OWNER_ONLY_MODE = 0o600
const TMP_SUFFIX_BYTES = 6

// Each write gets its own temp file, so a concurrent or failed write can
// never corrupt another writer's data or unlink its temp file mid-flight.
let tmpCounter = 0

function uniqueTmpPath(filePath: string): string {
  return `${filePath}.${process.pid}.${tmpCounter++}.tmp`
}

export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmp = uniqueTmpPath(filePath)
  try {
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, filePath)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    throw err
  }
}

// The temporary file is created exclusively with owner-only permissions, so
// the data is never readable by others, not even briefly, and a stale or
// concurrent temporary file is never reused.
export function atomicWriteOwnerOnlyFileSync(
  filePath: string,
  data: string
): void {
  const tmp = `${filePath}.${randomBytes(TMP_SUFFIX_BYTES).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, data, { mode: OWNER_ONLY_MODE, flag: 'wx' })
    fs.renameSync(tmp, filePath)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    throw err
  }
}

async function writeViaOwnTmp(filePath: string, data: string): Promise<void> {
  const tmp = uniqueTmpPath(filePath)
  try {
    await fs.promises.writeFile(tmp, data)
    await fs.promises.rename(tmp, filePath)
  } catch (err) {
    try {
      await fs.promises.unlink(tmp)
    } catch {}
    throw err
  }
}

// Writes to the same path are chained in call order, so a slow earlier
// write can never rename stale content over a newer write. The stored
// promise never rejects; each caller observes only its own failure.
const writeQueues = new Map<string, Promise<void>>()

export function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve()
  const write = previous.then(() => writeViaOwnTmp(filePath, data))
  const settled: Promise<void> = write
    .catch(() => undefined)
    .then(() => {
      if (writeQueues.get(filePath) === settled) {
        writeQueues.delete(filePath)
      }
    })
  writeQueues.set(filePath, settled)
  return write
}
