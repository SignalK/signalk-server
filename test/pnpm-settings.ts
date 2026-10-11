import { expect } from 'chai'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getBundledPnpm, PNPM_APP_STORE_SETTINGS } from '../src/modules'

// The App Store's pnpm reads the pnpm config of the user that the server runs
// as, which must not move packages out of the config directory's node_modules
describe('App Store pnpm settings', () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), '_skservertest_pnpmrc'))
    fs.mkdirSync(path.join(home, 'pnpm'))
    fs.writeFileSync(
      path.join(home, 'pnpm', 'config.yaml'),
      'enableGlobalVirtualStore: true\n'
    )
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  const globalVirtualStore = (settings: string[]) =>
    execFileSync(
      process.execPath,
      [
        getBundledPnpm().bin,
        ...settings,
        'config',
        'get',
        'enableGlobalVirtualStore'
      ],
      {
        cwd: home,
        encoding: 'utf8',
        env: { ...process.env, XDG_CONFIG_HOME: home }
      }
    ).trim()

  it('keeps packages out of a global virtual store that the user turned on', () => {
    expect(globalVirtualStore([])).to.equal('true')
    expect(globalVirtualStore(PNPM_APP_STORE_SETTINGS)).to.equal('false')
  })
})
