import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readInstalledReadme } from '../../dist/appstore/installed-readme'

let configModules: string
let appModules: string

function install(
  modulesDir: string,
  name: string,
  version: string,
  readme?: string
): void {
  const pkgDir = path.join(modulesDir, name)
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name, version })
  )
  if (readme !== undefined) {
    fs.writeFileSync(path.join(pkgDir, 'README.md'), readme)
  }
}

describe('appstore/installed-readme', () => {
  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-installed-readme-'))
    configModules = path.join(root, 'config', 'node_modules')
    appModules = path.join(root, 'app', 'node_modules')
  })

  afterEach(() => {
    fs.rmSync(path.dirname(path.dirname(configModules)), {
      recursive: true,
      force: true
    })
  })

  it('reads README.md when the installed version matches', () => {
    install(configModules, '@scope/pkg', '1.2.0', '# Installed')
    expect(
      readInstalledReadme([configModules], '@scope/pkg', '1.2.0')
    ).to.equal('# Installed')
  })

  it('returns undefined when the installed version differs', () => {
    install(configModules, 'pkg', '1.1.0', '# Older')
    expect(readInstalledReadme([configModules], 'pkg', '1.2.0')).to.equal(
      undefined
    )
  })

  it('returns undefined when the package ships no README.md', () => {
    install(configModules, 'pkg', '1.2.0')
    expect(readInstalledReadme([configModules], 'pkg', '1.2.0')).to.equal(
      undefined
    )
  })

  it('returns undefined when the package is not installed', () => {
    expect(
      readInstalledReadme([configModules, appModules], 'pkg', '1.2.0')
    ).to.equal(undefined)
  })

  it('stops at the first directory holding the package even when its version differs', () => {
    install(configModules, 'pkg', '1.1.0', '# Config copy')
    install(appModules, 'pkg', '1.2.0', '# App copy')
    expect(
      readInstalledReadme([configModules, appModules], 'pkg', '1.2.0')
    ).to.equal(undefined)
  })

  it('falls through to a later directory when earlier ones lack it', () => {
    install(appModules, 'pkg', '1.2.0', '# App copy')
    expect(
      readInstalledReadme([configModules, appModules], 'pkg', '1.2.0')
    ).to.equal('# App copy')
  })
})
