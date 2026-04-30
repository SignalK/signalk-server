import { expect } from 'chai'
import { buildPluginDetail } from '../../dist/appstore/detail.js'

describe('appstore/detail', () => {
  const summaryBase = {
    name: 'signalk-example',
    version: '1.0.0',
    screenshots: [] as string[],
    official: false,
    deprecated: false,
    description: 'x',
    keywords: [],
    npmReadme: '# hi'
  }

  it('hydrates required deps against resolver', async () => {
    const detail = await buildPluginDetail(
      { ...summaryBase, requires: ['signalk-charts-plugin', 'missing-pkg'] },
      (name) => {
        if (name === 'signalk-charts-plugin') {
          return {
            displayName: 'Charts',
            appIcon: 'https://x/y.png',
            installed: true
          }
        }
        return undefined
      }
    )
    expect(detail.requires).to.have.length(2)
    expect(detail.requires[0]).to.deep.equal({
      name: 'signalk-charts-plugin',
      displayName: 'Charts',
      appIcon: 'https://x/y.png',
      installed: true
    })
    expect(detail.requires[1]).to.deep.equal({
      name: 'missing-pkg',
      displayName: undefined,
      appIcon: undefined,
      installed: false
    })
  })

  it('hydrates recommends similarly', async () => {
    const detail = await buildPluginDetail(
      { ...summaryBase, recommends: ['r1'] },
      (name) =>
        name === 'r1' ? { displayName: 'R', installed: false } : undefined
    )
    expect(detail.recommends).to.have.length(1)
    expect(detail.recommends[0].installed).to.equal(false)
  })

  it('returns empty arrays when no deps present', async () => {
    const detail = await buildPluginDetail(summaryBase)
    expect(detail.requires).to.deep.equal([])
    expect(detail.recommends).to.deep.equal([])
  })

  it('marks readme from summary as already-fetched', async () => {
    const detail = await buildPluginDetail(summaryBase)
    expect(detail.readme).to.equal('# hi')
    expect(detail.readmeFormat).to.equal('markdown')
  })
})
