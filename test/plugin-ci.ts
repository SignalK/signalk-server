import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { getBundledPnpm, PNPM_APP_STORE_SETTINGS } from '../src/modules'

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'plugin-ci.yml'),
  'utf8'
)

// Plugin CI installs a plugin the way the App Store will, so that a plugin
// that installs there installs for its users too
function appStoreInstall() {
  const install = /npx --yes pnpm@(\d+) ((?:--config\.\S+ )+)add /.exec(
    workflow
  )
  expect(install, 'pnpm add command in plugin-ci.yml').to.not.equal(null)
  return { major: install![1], settings: install![2].trim().split(' ') }
}

describe('plugin-ci App Store install', () => {
  it('uses the App Store settings', () => {
    expect(appStoreInstall().settings).to.deep.equal(PNPM_APP_STORE_SETTINGS)
  })

  it('uses the major version of the pnpm bundled with the server', () => {
    expect(appStoreInstall().major).to.equal(
      getBundledPnpm().version.split('.')[0]
    )
  })
})
