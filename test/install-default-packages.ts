import { expect } from 'chai'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(
  __dirname,
  '..',
  'docker',
  'install-default-packages.sh'
)
const DEFAULTS = { '@mxtommy/kip': '^4.8.0', 'signalk-to-nmea2000': '^2.24.0' }

// Stands in for npm: logs each call, and fails "npm install" while the
// failure marker file exists.
const FAKE_NPM = `#!/bin/sh
echo "$*" >> "$NPM_LOG"
if [ "$1" = install ] && [ -f "$NPM_FAIL" ]; then
  exit 1
fi
`

describe('docker/install-default-packages.sh', function () {
  let dir: string
  let configDir: string
  let npmLog: string
  let npmFail: string

  const run = (edition: string) => {
    const serverPackageJson = path.join(dir, 'server-package.json')
    fs.writeFileSync(
      serverPackageJson,
      JSON.stringify({ signalk: { defaultPackages: DEFAULTS } })
    )
    return spawnSync('sh', [SCRIPT, serverPackageJson, configDir, edition], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`,
        NPM_LOG: npmLog,
        NPM_FAIL: npmFail,
        NPM_INSTALL_ATTEMPTS: '2',
        NPM_INSTALL_RETRY_DELAY_SECONDS: '0'
      }
    })
  }
  const npmCalls = () =>
    fs.existsSync(npmLog)
      ? fs.readFileSync(npmLog, 'utf-8').trim().split('\n')
      : []
  const configPackageJson = () =>
    JSON.parse(fs.readFileSync(path.join(configDir, 'package.json'), 'utf-8'))

  before(function () {
    if (process.platform === 'win32') {
      this.skip()
    }
  })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-install-defaults-'))
    configDir = path.join(dir, 'default-config')
    npmLog = path.join(dir, 'npm.log')
    npmFail = path.join(dir, 'npm.fail')
    fs.mkdirSync(path.join(dir, 'bin'))
    fs.writeFileSync(path.join(dir, 'bin', 'npm'), FAKE_NPM, { mode: 0o755 })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('installs the defaults and records them as installed in the full edition', () => {
    const result = run('full')
    expect(result.status, result.stderr).to.equal(0)
    expect(configPackageJson()).to.include({ name: 'signalk-server-config' })
    expect(configPackageJson().dependencies).to.deep.equal(DEFAULTS)
    expect(configPackageJson().signalkDefaultPackages).to.deep.equal({
      '@mxtommy/kip': 'installed',
      'signalk-to-nmea2000': 'installed'
    })
    expect(fs.readFileSync(path.join(configDir, '.npmrc'), 'utf-8')).to.equal(
      'package-lock=false\n'
    )
    expect(npmCalls()).to.deep.equal([
      'cache clean --force',
      'install --ignore-scripts --prefer-online'
    ])
  })

  it('records the defaults as declined and installs nothing in the core edition', () => {
    const result = run('core')
    expect(result.status, result.stderr).to.equal(0)
    expect(configPackageJson().dependencies).to.deep.equal({})
    expect(configPackageJson().signalkDefaultPackages).to.deep.equal({
      '@mxtommy/kip': 'declined',
      'signalk-to-nmea2000': 'declined'
    })
    expect(npmCalls()).to.deep.equal(['cache clean --force'])
  })

  it('fails the build once every install attempt has failed', () => {
    fs.writeFileSync(npmFail, '')
    const result = run('full')
    expect(result.status).to.equal(1)
    expect(result.stderr).to.contain('failed after 2 attempts')
    expect(npmCalls()).to.deep.equal([
      'cache clean --force',
      'install --ignore-scripts --prefer-online',
      'install --ignore-scripts --prefer-online'
    ])
  })
})
