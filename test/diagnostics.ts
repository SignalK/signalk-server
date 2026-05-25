import chai from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getDiagnostics, TRACKED_PACKAGES } from '../src/diagnostics'

const writeFakePackage = (
  nodeModulesDir: string,
  name: string,
  version: string
) => {
  const pkgDir = path.join(nodeModulesDir, name)
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name, version })
  )
}

describe('getDiagnostics', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-'))
    fs.mkdirSync(path.join(tmpDir, 'node_modules'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns versions for tracked packages that are installed', () => {
    const nodeModules = path.join(tmpDir, 'node_modules')
    writeFakePackage(nodeModules, '@canboat/canboatjs', '3.18.0')
    writeFakePackage(nodeModules, 'bonjour-service', '1.3.1')

    const config = {
      appPath: tmpDir,
      configPath: tmpDir
    }

    const result = getDiagnostics(config)
    chai.expect(result.packages).to.deep.include.members([
      { name: '@canboat/canboatjs', version: '3.18.0' },
      { name: 'bonjour-service', version: '1.3.1' }
    ])
  })

  it('skips tracked packages that are not installed', () => {
    const nodeModules = path.join(tmpDir, 'node_modules')
    writeFakePackage(nodeModules, '@canboat/canboatjs', '3.18.0')

    const config = {
      appPath: tmpDir,
      configPath: tmpDir
    }

    const result = getDiagnostics(config)
    chai.expect(result.packages).to.have.lengthOf(1)
    chai.expect(result.packages[0]).to.deep.equal({
      name: '@canboat/canboatjs',
      version: '3.18.0'
    })
  })

  it('prefers configPath over appPath when both have the same package', () => {
    const userInstall = path.join(tmpDir, 'node_modules')
    const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'apppath-'))
    fs.mkdirSync(path.join(appPath, 'node_modules'))

    try {
      writeFakePackage(
        path.join(appPath, 'node_modules'),
        'bonjour-service',
        '1.0.0'
      )
      writeFakePackage(userInstall, 'bonjour-service', '1.3.1')

      const config = {
        appPath,
        configPath: tmpDir
      }

      const result = getDiagnostics(config)
      const entry = result.packages.find((p) => p.name === 'bonjour-service')
      chai.expect(entry).to.deep.equal({
        name: 'bonjour-service',
        version: '1.3.1'
      })
    } finally {
      fs.rmSync(appPath, { recursive: true, force: true })
    }
  })

  it('handles malformed package.json without throwing', () => {
    const nodeModules = path.join(tmpDir, 'node_modules')
    const pkgDir = path.join(nodeModules, '@canboat/canboatjs')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{ not json')

    const config = {
      appPath: tmpDir,
      configPath: tmpDir
    }

    const result = getDiagnostics(config)
    chai.expect(result.packages).to.deep.equal([])
  })

  it('exposes the curated tracked-packages list', () => {
    chai.expect(TRACKED_PACKAGES).to.include('@canboat/canboatjs')
    chai.expect(TRACKED_PACKAGES).to.include('@signalk/server-admin-ui')
  })
})
