import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  findBundledPackages,
  findPackageLocation
} from '../dist/bundled-packages'
import { modulesWithKeyword } from '../dist/modules'
import type { Config } from '../dist/config/config'

function writePackage(dir: string, pkg: object) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
}

const serverPackage = {
  name: 'signalk-server',
  dependencies: { 'plain-dep': '^1.0.0' },
  optionalDependencies: { '@scope/webapp': '^1.0.0', 'not-installed': '^1.0.0' }
}

describe('bundled packages', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_bundled'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  // Lay out the server and its dependencies the way a package manager
  // would, returning the server's appPath and dependency directory.
  const layouts: Record<string, (root: string) => [string, string]> = {
    'nested under the server': (r) => {
      const appPath = path.join(r, 'signalk-server')
      return [appPath, path.join(appPath, 'node_modules')]
    },
    'hoisted beside the server': (r) => [
      path.join(r, 'node_modules', 'signalk-server'),
      path.join(r, 'node_modules')
    ],
    'linked as siblings in a pnpm store': (r) => {
      const deps = path.join(
        r,
        'node_modules',
        '.pnpm',
        'signalk-server@2.0.0',
        'node_modules'
      )
      return [path.join(deps, 'signalk-server'), deps]
    }
  }

  for (const [layout, createLayout] of Object.entries(layouts)) {
    it(`finds dependencies ${layout}`, () => {
      const [appPath, depsDir] = createLayout(root)
      writePackage(appPath, serverPackage)
      writePackage(path.join(depsDir, 'plain-dep'), { name: 'plain-dep' })
      writePackage(path.join(depsDir, '@scope', 'webapp'), {
        name: '@scope/webapp',
        keywords: ['signalk-webapp']
      })

      expect(findPackageLocation(appPath, '@scope/webapp')).to.equal(depsDir)
      expect(findBundledPackages(appPath)).to.deep.equal([
        { name: 'plain-dep', location: depsDir },
        { name: '@scope/webapp', location: depsDir }
      ])

      const configPath = path.join(root, 'config')
      fs.mkdirSync(configPath)
      const webapps = modulesWithKeyword(
        { appPath, configPath } as Config,
        'signalk-webapp'
      )
      expect(
        webapps.map((m) => [m.module, path.resolve(m.location)])
      ).to.deep.equal([['@scope/webapp', depsDir]])
    })
  }

  it('returns undefined for a package that is not installed', () => {
    const appPath = path.join(root, 'signalk-server')
    writePackage(appPath, serverPackage)
    expect(findPackageLocation(appPath, 'not-installed')).to.equal(undefined)
  })
})
