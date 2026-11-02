import { expect } from 'chai'
import { withPublishedVersions } from '../../dist/appstore/published-version.js'

const NAME = 'installed-wasm-plugin'

function installedEntry(version: string, installedVersion = version) {
  return { package: { name: NAME, version }, installedVersion }
}

describe('appstore/published-version', () => {
  it('offers npm latest when it is newer than the installed version', () => {
    const [entry] = withPublishedVersions([installedEntry('1.0.0')], {
      [NAME]: { latest: '2.0.0' }
    })
    expect(entry!.package.version).to.equal('2.0.0')
  })

  it('keeps the installed version when npm has nothing newer or nothing at all', () => {
    for (const tags of [{ [NAME]: { latest: '1.0.0' } }, {}]) {
      const [entry] = withPublishedVersions([installedEntry('1.0.0')], tags)
      expect(entry!.package.version).to.equal('1.0.0')
    }
  })

  it('bases a later pass on the installed version, not an earlier promotion', () => {
    const [cachedPass] = withPublishedVersions([installedEntry('1.0.0')], {
      [NAME]: { latest: '3.0.0' }
    })
    const [freshPass] = withPublishedVersions([cachedPass!], {
      [NAME]: { latest: '2.0.0' }
    })
    expect(freshPass!.package.version).to.equal('2.0.0')

    const [rolledBack] = withPublishedVersions([cachedPass!], {
      [NAME]: { latest: '1.0.0' }
    })
    expect(rolledBack!.package.version).to.equal('1.0.0')
  })

  it('leaves entries the search returned untouched', () => {
    const searched = { package: { name: NAME, version: '1.0.0' } }
    const [entry] = withPublishedVersions([searched], {
      [NAME]: { latest: '2.0.0' }
    })
    expect(entry).to.equal(searched)
  })
})
