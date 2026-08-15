import fs from 'fs'

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

export async function atomicWriteFile(
  filePath: string,
  data: string,
  mode?: number
): Promise<void> {
  const tmp = filePath + '.tmp'
  try {
    // mode on writeFile only applies when the file is created; the chmod
    // covers a tmp file left over from a crashed earlier attempt. Doing
    // both before the rename means a permission failure surfaces while
    // nothing has been persisted at the final path, and the file never
    // exists anywhere with looser permissions than asked.
    await fs.promises.writeFile(tmp, data, { mode })
    if (mode !== undefined) {
      await fs.promises.chmod(tmp, mode)
    }
    await fs.promises.rename(tmp, filePath)
  } catch (err) {
    try {
      await fs.promises.unlink(tmp)
    } catch {}
    throw err
  }
}
