import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { modulesWithKeyword } from '../src/modules'
import { Config } from '../src/config/config'

const KEYWORD = 'signalk-node-server-plugin'

/**
 * A package.json alone is a complete fixture: plugin discovery reads nothing
 * else from a package directory.
 */
function writePackage(dir: string, name: string, pkg: object = {}) {
  fs.mkdirSync(path.join(dir, name), { recursive: true })
  fs.writeFileSync(
    path.join(dir, name, 'package.json'),
    JSON.stringify({ name, ...pkg })
  )
}

describe('modulesWithKeyword with the server installed as a dependency', () => {
  let tempDir: string
  let nodeModules: string
  let config: Config

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_modules'))
    nodeModules = path.join(tempDir, 'node_modules')
    writePackage(nodeModules, 'signalk-server', {
      dependencies: { 'bundled-plugin': '^1.0.0', 'broken-plugin': '^1.0.0' },
      optionalDependencies: {
        '@scope/bundled-plugin': '^1.0.0',
        'missing-plugin': '^1.0.0'
      }
    })
    config = {
      appPath: path.join(nodeModules, 'signalk-server/'),
      configPath: path.join(tempDir, 'config')
    } as Config
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('finds the bundled plugins npm hoisted next to the server', () => {
    writePackage(nodeModules, 'bundled-plugin', { keywords: [KEYWORD] })
    writePackage(nodeModules, '@scope/bundled-plugin', { keywords: [KEYWORD] })
    writePackage(nodeModules, 'unrelated-plugin', { keywords: [KEYWORD] })

    const moduleList = modulesWithKeyword(config, KEYWORD)

    expect(moduleList.map((m) => m.module)).to.have.members([
      'bundled-plugin',
      '@scope/bundled-plugin'
    ])
    expect(moduleList.map((m) => m.location)).to.eql([
      path.join(nodeModules, '/'),
      path.join(nodeModules, '/')
    ])
  })

  it('prefers a copy installed in the config dir', () => {
    writePackage(nodeModules, 'bundled-plugin', { keywords: [KEYWORD] })
    const configNodeModules = path.join(config.configPath, 'node_modules')
    writePackage(configNodeModules, 'bundled-plugin', { keywords: [KEYWORD] })

    const moduleList = modulesWithKeyword(config, KEYWORD)

    expect(moduleList.map((m) => m.location)).to.eql([
      path.join(configNodeModules, '/')
    ])
  })

  it('skips a bundled package whose package.json cannot be read', () => {
    writePackage(nodeModules, 'bundled-plugin', { keywords: [KEYWORD] })
    fs.mkdirSync(path.join(nodeModules, 'broken-plugin'))
    fs.writeFileSync(
      path.join(nodeModules, 'broken-plugin', 'package.json'),
      '{ not json'
    )

    const moduleList = modulesWithKeyword(config, KEYWORD)

    expect(moduleList.map((m) => m.module)).to.eql(['bundled-plugin'])
  })

  it('skips a bundled package with an invalid package.json', () => {
    writePackage(nodeModules, 'bundled-plugin', { keywords: [KEYWORD] })
    writePackage(nodeModules, 'broken-plugin', { keywords: 1 })
    writePackage(nodeModules, 'missing-plugin', { keywords: KEYWORD })
    fs.mkdirSync(path.join(nodeModules, '@scope/bundled-plugin'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(nodeModules, '@scope/bundled-plugin', 'package.json'),
      'null'
    )

    const moduleList = modulesWithKeyword(config, KEYWORD)

    expect(moduleList.map((m) => m.module)).to.eql(['bundled-plugin'])
  })
})
