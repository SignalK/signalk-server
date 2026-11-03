import { randomBytes } from 'crypto'
import fs from 'fs'

const OWNER_ONLY_MODE = 0o600
const TMP_SUFFIX_BYTES = 6

export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmp = filePath + '.tmp'
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

export async function atomicWriteFile(
  filePath: string,
  data: string
): Promise<void> {
  const tmp = filePath + '.tmp'
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
