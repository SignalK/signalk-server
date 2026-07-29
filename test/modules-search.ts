import { expect } from 'chai'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findModulesWithKeyword } = require('../dist/modules')

interface SearchObject {
  package: { name: string; version: string }
}

const NPM_PAGE_SIZE = 250
const NPM_SEARCH_MAX_PAGES = 20

describe('findModulesWithKeyword', () => {
  // each test uses its own keyword because results are cached per
  // keyword for 60s at module level
  const originalFetch = global.fetch
  let fetchCalls: number[] = []

  function searchPage(objects: unknown[], total: number): Response {
    return Response.json({ objects, total })
  }

  function searchObjects(
    prefix: string,
    count: number,
    start = 0
  ): SearchObject[] {
    return Array.from({ length: count }, (_, i) => ({
      package: { name: `${prefix}-${start + i}`, version: '1.0.0' }
    }))
  }

  // the stub serves pages by the requested from= offset so an
  // implementation stuck re-requesting the same offset cannot pass
  function stubFetch(pageForOffset: (from: number) => Response) {
    fetchCalls = []
    global.fetch = (input: RequestInfo | URL) => {
      const from = Number(new URL(String(input)).searchParams.get('from'))
      fetchCalls.push(from)
      return Promise.resolve(pageForOffset(from))
    }
  }

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('pages through multi-page search results', async () => {
    const lastPageSize = 50
    const total = 2 * NPM_PAGE_SIZE + lastPageSize
    stubFetch((from) => {
      if (from < 2 * NPM_PAGE_SIZE) {
        return searchPage(searchObjects('multi', NPM_PAGE_SIZE, from), total)
      }
      if (from === 2 * NPM_PAGE_SIZE) {
        return searchPage(searchObjects('multi', lastPageSize, from), total)
      }
      return searchPage([], total)
    })
    const packages = await findModulesWithKeyword('test-multi-page')
    expect(packages).to.have.length(total)
    expect(fetchCalls).to.deep.equal([0, NPM_PAGE_SIZE, 2 * NPM_PAGE_SIZE])
  })

  it('resolves with partial results when npm returns an empty page below total', async () => {
    // npm's total is an estimate: an empty page below the claimed
    // total must end pagination with the accumulated results
    const total = NPM_PAGE_SIZE + 50
    stubFetch((from) =>
      from === 0
        ? searchPage(searchObjects('short', NPM_PAGE_SIZE), total)
        : searchPage([], total)
    )
    const packages = await findModulesWithKeyword('test-empty-page')
    expect(packages).to.have.length(NPM_PAGE_SIZE)
    expect(fetchCalls).to.deep.equal([0, NPM_PAGE_SIZE])
  })

  it('stops paging at the page cap when total keeps growing', async () => {
    stubFetch((from) => searchPage(searchObjects('grow', 1, from), 1000))
    const packages = await findModulesWithKeyword('test-page-cap')
    expect(packages).to.have.length(NPM_SEARCH_MAX_PAGES)
    expect(fetchCalls).to.deep.equal(
      Array.from({ length: NPM_SEARCH_MAX_PAGES }, (_, i) => i)
    )
  })

  it('drops entries with invalid or missing versions', async () => {
    stubFetch(() =>
      searchPage(
        [
          { package: { name: 'valid-pkg', version: '1.0.0' } },
          { package: { name: 'valid-pkg', version: 'not-semver' } },
          { package: { name: 'invalid-only', version: 'also-bad' } },
          {}
        ],
        4
      )
    )
    const packages = await findModulesWithKeyword('test-invalid-version')
    expect(packages).to.have.length(1)
    expect(packages[0].package.name).to.equal('valid-pkg')
    expect(packages[0].package.version).to.equal('1.0.0')
  })

  it('coalesces concurrent searches for the same keyword', async () => {
    stubFetch(() => searchPage(searchObjects('single', 1), 1))
    const [first, second] = await Promise.all([
      findModulesWithKeyword('test-coalesce'),
      findModulesWithKeyword('test-coalesce')
    ])
    expect(fetchCalls).to.have.length(1)
    expect(first).to.equal(second)
    const third = await findModulesWithKeyword('test-coalesce')
    expect(third).to.equal(first)
    expect(fetchCalls).to.have.length(1)
  })
})
