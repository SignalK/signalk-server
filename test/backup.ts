import archiver from 'archiver'
import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { extractBackup, restoreBackup } from '../src/backup'

// A backup of a config directory with a pnpm node_modules: the plugin entry
// is a link into the virtual store, as are the plugin's dependencies there
function writeBackup(zipFile: string, sourceDir: string): Promise<void> {
  const pluginDir = path.join(
    sourceDir,
    'node_modules/.pnpm/plugin@1.0.0/node_modules/plugin'
  )
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(sourceDir, 'settings.json'), '{}\n')
  fs.symlinkSync(
    '.pnpm/plugin@1.0.0/node_modules/plugin',
    path.join(sourceDir, 'node_modules/plugin')
  )
  fs.symlinkSync('../../../../../../outside', path.join(pluginDir, 'escape'))

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFile)
    const archive = archiver('zip')
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(path.join(sourceDir, 'node_modules'), 'node_modules')
    archive.file(path.join(sourceDir, 'settings.json'), {
      name: 'settings.json'
    })
    archive.finalize()
  })
}

// A backup built entry by entry, for archives a real backup never contains
function writeArchive(
  zipFile: string,
  fill: (archive: archiver.Archiver) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFile)
    const archive = archiver('zip')
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    fill(archive)
    archive.finalize()
  })
}

const CENTRAL_HEADER = Buffer.from('PK\x01\x02', 'latin1')

// archiver writes every appended entry as a regular file, so its type is
// rewritten in the central directory, where an extraction reads it
function markAsLink(zipFile: string, name: string) {
  const zip = fs.readFileSync(zipFile)
  for (
    let at = zip.indexOf(CENTRAL_HEADER);
    at !== -1;
    at = zip.indexOf(CENTRAL_HEADER, at + 1)
  ) {
    const nameLength = zip.readUInt16LE(at + 28)
    if (zip.toString('utf8', at + 46, at + 46 + nameLength) === name) {
      zip.writeUInt32LE((0o120777 << 16) >>> 0, at + 38)
    }
  }
  fs.writeFileSync(zipFile, zip)
}

describe('extractBackup', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_backup'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('restores the links pnpm builds node_modules from', async () => {
    const zipFile = path.join(root, 'backup.zip')
    await writeBackup(zipFile, path.join(root, 'source'))
    const target = path.join(root, 'restored')

    await extractBackup(zipFile, target)

    expect(
      fs.readFileSync(path.join(target, 'settings.json'), 'utf8')
    ).to.equal('{}\n')
    const link = path.join(target, 'node_modules/plugin')
    expect(fs.lstatSync(link).isSymbolicLink()).to.equal(true)
    expect(fs.readlinkSync(link)).to.equal(
      '.pnpm/plugin@1.0.0/node_modules/plugin'
    )
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require(link)).to.equal(1)
  })

  it('leaves out links that point outside the backup', async () => {
    const zipFile = path.join(root, 'backup.zip')
    await writeBackup(zipFile, path.join(root, 'source'))
    const target = path.join(root, 'restored')

    await extractBackup(zipFile, target)

    const escape = path.join(
      target,
      'node_modules/.pnpm/plugin@1.0.0/node_modules/plugin/escape'
    )
    expect(() => fs.lstatSync(escape)).to.throw(/ENOENT/)
  })

  // s/t/u/y leads to s, so s/t/u/v/x, whose own target stays inside by
  // name, actually leads two levels above the restore directory
  const chainedLinks = (archive: archiver.Archiver) => {
    archive.symlink('s/t/u/y', '../..')
    archive.symlink('s/t/u/v/x', '../y/../../..')
  }

  it('removes a link that leads outside through another link', async () => {
    const zipFile = path.join(root, 'backup.zip')
    await writeArchive(zipFile, chainedLinks)
    const target = path.join(root, 'restored')

    await extractBackup(zipFile, target)

    expect(fs.readlinkSync(path.join(target, 's/t/u/y'))).to.equal('../..')
    expect(() => fs.lstatSync(path.join(target, 's/t/u/v/x'))).to.throw(
      /ENOENT/
    )
  })

  it('never writes a file through a link', async () => {
    const zipFile = path.join(root, 'backup.zip')
    await writeArchive(zipFile, (archive) => {
      chainedLinks(archive)
      archive.append('escaped', { name: 's/t/u/v/x/evil' })
    })
    const target = path.join(root, 'restored')

    await extractBackup(zipFile, target)

    const written = path.join(target, 's/t/u/v/x/evil')
    expect(fs.readFileSync(written, 'utf8')).to.equal('escaped')
    expect(fs.lstatSync(path.dirname(written)).isDirectory()).to.equal(true)
    expect(fs.readdirSync(root).sort()).to.deep.equal([
      'backup.zip',
      'restored'
    ])
  })

  it('leaves out links with an absolute target', async () => {
    const zipFile = path.join(root, 'backup.zip')
    const target = path.join(root, 'restored')
    await writeArchive(zipFile, (archive) => {
      archive.symlink('absolute', path.join(target, 'elsewhere'))
    })

    await extractBackup(zipFile, target)

    expect(() => fs.lstatSync(path.join(target, 'absolute'))).to.throw(/ENOENT/)
  })

  it('leaves out links with a target no file system accepts', async () => {
    const zipFile = path.join(root, 'backup.zip')
    await writeArchive(zipFile, (archive) => {
      archive.append('kept', { name: 'settings.json' })
      archive.symlink('long', 'a/'.repeat(4096))
      // Small enough to read compressed, far too long once inflated
      archive.append('a'.repeat(100000), { name: 'inflated' })
    })
    markAsLink(zipFile, 'inflated')
    const target = path.join(root, 'restored')

    await extractBackup(zipFile, target)

    expect(() => fs.lstatSync(path.join(target, 'long'))).to.throw(/ENOENT/)
    expect(() => fs.lstatSync(path.join(target, 'inflated'))).to.throw(/ENOENT/)
    expect(
      fs.readFileSync(path.join(target, 'settings.json'), 'utf8')
    ).to.equal('kept')
  })
})

describe('restoreBackup', () => {
  let root: string
  let restoreDir: string
  let configDir: string

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_restore'))
    restoreDir = path.join(root, 'restored')
    configDir = path.join(root, 'config')
    fs.mkdirSync(configDir)
    const zipFile = path.join(root, 'backup.zip')
    await writeBackup(zipFile, path.join(root, 'source'))
    await extractBackup(zipFile, restoreDir)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('copies the chosen entries with their links', async () => {
    const copied: string[] = []

    await restoreBackup(
      restoreDir,
      configDir,
      ['settings.json', 'node_modules/'],
      (name) => copied.push(name)
    )

    expect(copied).to.deep.equal(['settings.json', 'node_modules/'])
    const link = path.join(configDir, 'node_modules/plugin')
    expect(fs.readlinkSync(link)).to.equal(
      '.pnpm/plugin@1.0.0/node_modules/plugin'
    )
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require(link)).to.equal(1)
  })

  // The config directory keeps node_modules on another disk, so the copy
  // writes there: a link leading from node_modules up to the settings would
  // then lead to a file beside it on that disk
  it('keeps only the links that lead where they did in the backup', async () => {
    const disk = path.join(root, 'disk')
    fs.mkdirSync(path.join(disk, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(disk, 'settings.json'), 'not the settings\n')
    fs.symlinkSync(
      path.join(disk, 'node_modules'),
      path.join(configDir, 'node_modules')
    )
    fs.symlinkSync(
      '../settings.json',
      path.join(restoreDir, 'node_modules/settings')
    )

    await restoreBackup(
      restoreDir,
      configDir,
      ['settings.json', 'node_modules/'],
      () => {}
    )

    expect(() =>
      fs.lstatSync(path.join(disk, 'node_modules/settings'))
    ).to.throw(/ENOENT/)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require(path.join(configDir, 'node_modules/plugin'))).to.equal(1)
  })

  // A chosen settings file can itself be a link. Through a directory that the
  // config directory keeps on another disk, it would lead to a file there
  // rather than to the one it led to in the backup.
  it('checks a chosen entry that is itself a link', async () => {
    const disk = path.join(root, 'disk')
    fs.mkdirSync(path.join(disk, 'x'), { recursive: true })
    fs.writeFileSync(path.join(disk, 'real.json'), 'not the settings\n')
    fs.symlinkSync(path.join(disk, 'x'), path.join(configDir, 'x'))
    fs.mkdirSync(path.join(restoreDir, 'x'))
    fs.writeFileSync(path.join(restoreDir, 'real.json'), '{}\n')
    fs.symlinkSync('x/../real.json', path.join(restoreDir, 'security.json'))

    await restoreBackup(restoreDir, configDir, ['security.json'], () => {})

    expect(() => fs.lstatSync(path.join(configDir, 'security.json'))).to.throw(
      /ENOENT/
    )
  })
})
