import { expect } from 'chai'
import {
  installedModuleKeywords,
  isPluginPackage,
  isWasmPackage
} from '../../dist/appstore/plugin-keywords.js'

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
