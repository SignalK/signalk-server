import fs from 'fs'

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
