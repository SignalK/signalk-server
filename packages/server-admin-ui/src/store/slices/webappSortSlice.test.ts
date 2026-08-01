import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from '../index'
import {
  WEBAPP_SORT_MODE_KEY,
  WEBAPP_CUSTOM_ORDER_KEY,
  WEBAPP_LAST_USED_KEY
} from './webappSortSlice'

interface FetchCall {
  url: string
  init?: RequestInit
}

function mockFetch(status: number, body?: unknown): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
      }
    })
  )
  return calls
}

const postCalls = (calls: FetchCall[]) =>
  calls.filter((c) => c.init?.method === 'POST')

describe('webappSortSlice', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useStore.setState({
      webappSortMode: 'name',
      webappCustomOrder: [],
      webappLastUsed: {},
      webappSortSynced: false
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initWebappSort', () => {
    it('defaults to name mode on a fresh install (nothing persisted, security off)', async () => {
      mockFetch(405)

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('name')
      expect(s.webappCustomOrder).toEqual([])
      expect(s.webappLastUsed).toEqual({})
      expect(s.webappSortSynced).toBe(false)
    })

    it('restores the last chosen mode from localStorage', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'lastUsed')
      mockFetch(405)

      await useStore.getState().initWebappSort()

      expect(useStore.getState().webappSortMode).toBe('lastUsed')
    })

    it('falls back to defaults for invalid stored values', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'frecency')
      window.localStorage.setItem(WEBAPP_CUSTOM_ORDER_KEY, '{not json')
      // Valid JSON, wrong shape:
      window.localStorage.setItem(WEBAPP_LAST_USED_KEY, '["a"]')
      mockFetch(405)

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('name')
      expect(s.webappCustomOrder).toEqual([])
      expect(s.webappLastUsed).toEqual({})
    })

    it('lets the server copy win for mode and order and max-merges lastUsed', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'name')
      window.localStorage.setItem(
        WEBAPP_LAST_USED_KEY,
        JSON.stringify({ local: 100, both: 900 })
      )
      const calls = mockFetch(200, {
        sortMode: 'custom',
        customOrder: ['server-app'],
        lastUsed: { server: 50, both: 200 }
      })

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('custom')
      expect(s.webappCustomOrder).toEqual(['server-app'])
      expect(s.webappLastUsed).toEqual({ local: 100, both: 900, server: 50 })
      expect(s.webappSortSynced).toBe(true)
      // Local launches were unknown to the server → merged doc pushed up.
      expect(postCalls(calls).length).toBe(1)
      // The merged state is also written back to localStorage.
      expect(window.localStorage.getItem(WEBAPP_SORT_MODE_KEY)).toBe('custom')
    })

    it('treats a 200 with {} as available-but-empty and pushes local state up', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'custom')
      window.localStorage.setItem(
        WEBAPP_CUSTOM_ORDER_KEY,
        JSON.stringify(['a'])
      )
      const calls = mockFetch(200, {})

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('custom')
      expect(s.webappCustomOrder).toEqual(['a'])
      expect(s.webappSortSynced).toBe(true)
      expect(postCalls(calls).length).toBe(1)
    })

    it('treats a 404 (security off, routes not mounted) as unavailable', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'custom')
      mockFetch(404)

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('custom')
      expect(s.webappSortSynced).toBe(false)
    })

    it('ignores a malformed server document', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'lastUsed')
      mockFetch(200, { sortMode: 'frecency', bogus: true })

      await useStore.getState().initWebappSort()

      const s = useStore.getState()
      expect(s.webappSortMode).toBe('lastUsed')
      expect(s.webappSortSynced).toBe(true)
    })

    it('keeps a user edit made while the GET is in flight over the server copy', async () => {
      window.localStorage.setItem(WEBAPP_SORT_MODE_KEY, 'name')
      let releaseGet = () => {}
      const gate = new Promise<void>((resolve) => {
        releaseGet = resolve
      })
      const calls: FetchCall[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          calls.push({ url, init })
          if (!init?.method) await gate
          return {
            ok: true,
            status: 200,
            json: async () => ({
              sortMode: 'lastUsed',
              customOrder: [],
              lastUsed: {}
            })
          }
        })
      )

      const init = useStore.getState().initWebappSort()
      useStore.getState().setWebappSortMode('custom')
      releaseGet()
      await init

      expect(useStore.getState().webappSortMode).toBe('custom')
    })

    it('stays localStorage-only on network errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('offline')
        })
      )

      await useStore.getState().initWebappSort()

      expect(useStore.getState().webappSortSynced).toBe(false)
    })
  })

  describe('setWebappSortMode / setWebappCustomOrder', () => {
    it('persists to localStorage', () => {
      const calls = mockFetch(405)

      useStore.getState().setWebappSortMode('custom')
      useStore.getState().setWebappCustomOrder(['b', 'a'])

      expect(window.localStorage.getItem(WEBAPP_SORT_MODE_KEY)).toBe('custom')
      expect(window.localStorage.getItem(WEBAPP_CUSTOM_ORDER_KEY)).toBe(
        JSON.stringify(['b', 'a'])
      )
      expect(useStore.getState().webappSortMode).toBe('custom')
      expect(useStore.getState().webappCustomOrder).toEqual(['b', 'a'])
      // Not synced → no server traffic.
      expect(postCalls(calls).length).toBe(0)
    })

    it('POSTs the full document when synced', () => {
      const calls = mockFetch(200, {})
      useStore.setState({ webappSortSynced: true, webappLastUsed: { a: 1 } })

      useStore.getState().setWebappSortMode('lastUsed')

      expect(postCalls(calls).length).toBe(1)
      expect(JSON.parse(String(postCalls(calls)[0].init?.body))).toEqual({
        sortMode: 'lastUsed',
        customOrder: [],
        lastUsed: { a: 1 }
      })
    })
  })

  describe('recordWebappLaunch', () => {
    it('writes the timestamp to localStorage synchronously and never POSTs', () => {
      const calls = mockFetch(200, {})
      useStore.setState({ webappSortSynced: true })

      useStore.getState().recordWebappLaunch('@signalk/freeboard-sk')

      const stored = JSON.parse(
        window.localStorage.getItem(WEBAPP_LAST_USED_KEY) ?? '{}'
      )
      expect(typeof stored['@signalk/freeboard-sk']).toBe('number')
      expect(stored['@signalk/freeboard-sk']).toBeGreaterThan(0)
      expect(useStore.getState().webappLastUsed['@signalk/freeboard-sk']).toBe(
        stored['@signalk/freeboard-sk']
      )
      expect(postCalls(calls).length).toBe(0)
    })
  })
})
