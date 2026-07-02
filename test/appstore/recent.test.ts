import { expect } from 'chai'
import { isRecent } from '../../dist/categories.js'
import { buildPluginDetail } from '../../dist/appstore/detail.js'

describe('appstore/recent', () => {
  describe('isRecent', () => {
    it('treats undefined as not recent', () => {
      expect(isRecent(undefined)).to.equal(false)
    })

    it('treats malformed date strings as not recent', () => {
      expect(isRecent('not-a-date')).to.equal(false)
    })

    it('returns true for a date within the last 30 days', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      expect(isRecent(oneDayAgo)).to.equal(true)
    })

    it('returns false for a date older than 30 days', () => {
      const sixtyDaysAgo = new Date(
        Date.now() - 60 * 24 * 3600 * 1000
      ).toISOString()
      expect(isRecent(sixtyDaysAgo)).to.equal(false)
    })
  })

  describe('buildPluginDetail recent flag', () => {
    const summaryBase = {
      name: 'signalk-example',
      version: '1.0.0',
      screenshots: [] as string[],
      official: false,
      deprecated: false,
      keywords: [],
      npmReadme: '# hi'
    }

    it('marks recent when lastReleaseDate is within the window', async () => {
      const detail = await buildPluginDetail({
        ...summaryBase,
        lastReleaseDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      })
      expect(detail.recent).to.equal(true)
    })

    it('omits or unsets recent when lastReleaseDate is old', async () => {
      const detail = await buildPluginDetail({
        ...summaryBase,
        lastReleaseDate: new Date(
          Date.now() - 60 * 24 * 3600 * 1000
        ).toISOString()
      })
      expect(detail.recent).to.equal(false)
    })
  })
})
