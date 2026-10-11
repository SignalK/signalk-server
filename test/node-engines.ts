import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import semver from 'semver'
import { getBundledPnpm } from '../src/modules'

const { engines } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
)

// The App Store installs with the bundled pnpm, so the server declares no
// Node.js version that this pnpm does not run on
describe('Node.js versions', () => {
  it('declares only versions that the bundled pnpm runs on', () => {
    const pnpmNode = getBundledPnpm().node
    // A pnpm that names no lowest Node.js version would let any range pass
    expect(
      semver.minVersion(pnpmNode)?.version,
      `pnpm ${pnpmNode}`
    ).to.not.equal('0.0.0')
    expect(
      semver.subset(engines.node, pnpmNode),
      `server ${engines.node}, pnpm ${pnpmNode}`
    ).to.equal(true)
  })
})
