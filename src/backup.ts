import fs from 'fs'
import ncp from 'ncp'
import path from 'path'
import { pipeline } from 'stream/promises'
import unzipper from 'unzipper'
import { promisify } from 'util'

const S_IFMT = 0o170000
const S_IFLNK = 0o120000
// No file system accepts a longer link target
const MAX_LINK_TARGET_BYTES = 4096

const copy = promisify(ncp)

interface Link {
  path: string
  target: string
}

// Extracts a settings backup, keeping the symbolic links that pnpm builds
// node_modules from. Every file and directory is written before any link
// exists, so no write passes through a link, and the directory of each link
// is a real one. A link is kept only when it leads inside the target
// directory; a check of its own target is not enough, as it can reach
// further through other links.
export async function extractBackup(zipFile: string, targetDir: string) {
  fs.mkdirSync(targetDir, { recursive: true })
  const base = fs.realpathSync.native(targetDir)
  const directory = await unzipper.Open.file(zipFile)
  const links: Link[] = []
  for (const entry of directory.files) {
    const target = path.resolve(base, entry.path)
    if (!isInside(base, target)) {
      console.error(`Zip slip attempt blocked: ${entry.path}`)
      continue
    }
    if (entry.type === 'Directory') {
      fs.mkdirSync(target, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK) {
      const linkTarget = await readLinkTarget(entry)
      if (linkTarget === undefined) {
        console.error(`Link with an oversized target blocked: ${entry.path}`)
      } else {
        links.push({ path: target, target: linkTarget })
      }
    } else {
      await pipeline(entry.stream(), fs.createWriteStream(target))
    }
  }
  const created = links.filter((link) => createLink(base, link))
  removeLinksUnless(
    created.map((link) => link.path),
    (link) => {
      const real = realpath(link)
      return real !== undefined && isInside(base, real)
    }
  )
}

// Copies the chosen entries of an extracted backup into the configuration
// directory. The copy follows the links the configuration directory already
// has, such as a node_modules kept on another disk, and a restored link that
// lands under one can lead elsewhere than in the backup, outside included.
// A link is kept only when it leads to the same entry as in the backup.
export async function restoreBackup(
  restoreDir: string,
  configDir: string,
  names: string[],
  onCopy: (name: string, index: number) => void
) {
  const restoreBase = fs.realpathSync.native(restoreDir)
  const entryOfLink = new Map<string, string>()
  for (const [index, name] of names.entries()) {
    onCopy(name, index)
    const source = path.join(restoreDir, name)
    await copy(source, path.join(configDir, name), { stopOnErr: true })
    for (const link of findLinks(source)) {
      const entry = path.relative(restoreBase, fs.realpathSync.native(link))
      entryOfLink.set(
        path.join(configDir, path.relative(restoreDir, link)),
        path.join(configDir, entry)
      )
    }
  }
  removeLinksUnless([...entryOfLink.keys()], (link) => {
    const real = realpath(link)
    return real !== undefined && real === realpath(entryOfLink.get(link)!)
  })
}

function findLinks(entry: string): string[] {
  const stats = fs.lstatSync(entry)
  if (stats.isSymbolicLink()) {
    return [entry]
  }
  if (!stats.isDirectory()) {
    return []
  }
  return fs
    .readdirSync(entry, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

// The sizes an archive declares are not trusted, as a crafted entry could
// fill memory: only as much of a target as a file system accepts is kept.
// The compressed size bounds what is read, so a large one is refused
// unread, and the rest of a small one is drained to release the archive.
async function readLinkTarget(
  entry: unzipper.File
): Promise<string | undefined> {
  if (entry.compressedSize > MAX_LINK_TARGET_BYTES) {
    return undefined
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of entry.stream()) {
    size += chunk.length
    if (size <= MAX_LINK_TARGET_BYTES) {
      chunks.push(chunk)
    }
  }
  return size <= MAX_LINK_TARGET_BYTES
    ? Buffer.concat(chunks).toString()
    : undefined
}

function createLink(base: string, link: Link): boolean {
  const name = path.relative(base, link.path)
  if (
    path.isAbsolute(link.target) ||
    !isInside(base, path.resolve(path.dirname(link.path), link.target))
  ) {
    console.error(`Link outside the backup blocked: ${name}`)
    return false
  }
  try {
    fs.symlinkSync(link.target, link.path)
    return true
  } catch (err) {
    console.error(`Link ${name} not restored: ${(err as Error).message}`)
    return false
  }
}

// Removing a link can leave others that led through it dangling, so the
// check repeats until every remaining link passes it.
function removeLinksUnless(links: string[], keep: (link: string) => boolean) {
  let remaining = links
  let removed = true
  while (removed) {
    removed = false
    remaining = remaining.filter((link) => {
      if (keep(link)) {
        return true
      }
      console.error(
        `Link leading elsewhere than in the backup removed: ${link}`
      )
      fs.unlinkSync(link)
      removed = true
      return false
    })
  }
}

// The native realpath follows each link before applying the '..' after it,
// as the kernel does; fs.realpathSync resolves link targets by name.
function realpath(p: string): string | undefined {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return undefined
  }
}

function isInside(base: string, p: string): boolean {
  return p.startsWith(base + path.sep)
}
