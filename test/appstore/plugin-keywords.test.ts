import { expect } from 'chai'
import {
  installedModuleKeywords,
  isPluginPackage,
  isWasmPackage,
  mergePluginSearchResults
} from '../../dist/appstore/plugin-keywords.js'

function result(name: string, version: string) {
  return { package: { name, version } }
}

describe('appstore/plugin-keywords', () => {
  it('treats Node and WASM plugin keywords as plugins', () => {
    expect(isPluginPackage(['signalk-node-server-plugin'])).to.equal(true)
    expect(isPluginPackage(['signalk-wasm-plugin'])).to.equal(true)
    expect(isPluginPackage(['signalk-webapp'])).to.equal(false)
    expect(isPluginPackage(undefined)).to.equal(false)
  })

  it('flags only the WASM keyword as WASM', () => {
    expect(isWasmPackage(['signalk-wasm-plugin'])).to.equal(true)
    expect(isWasmPackage(['signalk-node-server-plugin'])).to.equal(false)
    expect(isWasmPackage(undefined)).to.equal(false)
  })

  it('keeps the newest version of a package found by several searches', () => {
    const merged = mergePluginSearchResults(
      [result('dual', '1.0.0'), result('node-only', '1.0.0')],
      [result('dual', '2.0.0'), result('wasm-only', '1.0.0')]
    )
    expect(
      merged.map((m) => [m.package.name, m.package.version])
    ).to.deep.equal([
      ['dual', '2.0.0'],
      ['node-only', '1.0.0'],
      ['wasm-only', '1.0.0']
    ])
  })

  it('does not let an invalid version replace a valid one', () => {
    const merged = mergePluginSearchResults(
      [result('pkg', '1.0.0')],
      [result('pkg', 'not-a-version')]
    )
    expect(merged[0]!.package.version).to.equal('1.0.0')
  })

  it('adds the WASM keyword to installed WASM modules that lack it', () => {
    expect(
      installedModuleKeywords(
        { type: 'wasm', keywords: ['signalk-node-server-plugin'] },
        'signalk-node-server-plugin'
      )
    ).to.deep.equal(['signalk-node-server-plugin', 'signalk-wasm-plugin'])
    expect(
      installedModuleKeywords({ type: 'wasm' }, 'signalk-node-server-plugin')
    ).to.deep.equal(['signalk-node-server-plugin', 'signalk-wasm-plugin'])
    expect(
      installedModuleKeywords(
        { type: 'wasm', keywords: ['signalk-wasm-plugin'] },
        'signalk-node-server-plugin'
      )
    ).to.deep.equal(['signalk-wasm-plugin'])
  })

  it('leaves Node modules on their own or the fallback keywords', () => {
    expect(
      installedModuleKeywords({}, 'signalk-node-server-plugin')
    ).to.deep.equal(['signalk-node-server-plugin'])
    expect(
      installedModuleKeywords(
        { keywords: ['signalk-webapp'] },
        'signalk-node-server-plugin'
      )
    ).to.deep.equal(['signalk-webapp'])
  })
})
