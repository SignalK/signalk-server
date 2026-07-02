import React, { Suspense } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  loadScriptOnce,
  toLazyDynamicComponent,
  toSafeModuleId
} from './dynamicutilities'

// Mirrors SCRIPT_LOAD_TIMEOUT_MS in the module under test.
const SCRIPT_LOAD_TIMEOUT_MS = 10000

// A settled flag for asserting a promise has/has not resolved without awaiting.
const track = (p: Promise<unknown>) => {
  const state = { settled: false }
  p.then(() => {
    state.settled = true
  })
  return state
}

const addScriptTag = (src: string): HTMLScriptElement => {
  const script = document.createElement('script')
  script.src = src
  document.head.appendChild(script)
  return script
}

describe('loadScriptOnce', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[src]').forEach((s) => s.remove())
    vi.useRealTimers()
  })

  it('short-circuits when ready() is already true (script already executed)', async () => {
    // No tag in the DOM at all — ready() short-circuit must win regardless.
    await expect(
      loadScriptOnce('/already-ran/remoteEntry.js', () => true)
    ).resolves.toBeUndefined()
  })

  it('resolves immediately when no matching script tag exists', async () => {
    await expect(
      loadScriptOnce('/missing/remoteEntry.js', () => false)
    ).resolves.toBeUndefined()
  })

  it('pends until the existing tag fires load, then resolves (the race)', async () => {
    const url = '/race/remoteEntry.js'
    const script = addScriptTag(url)

    let registered = false // stands in for window[safeId] being set
    const promise = loadScriptOnce(url, () => registered)
    const tracked = track(promise)

    // Microtask flush: the tag has not loaded yet, so we must still be waiting.
    await Promise.resolve()
    expect(tracked.settled).toBe(false)

    // The classic remote executes: it registers its global, then load fires.
    registered = true
    script.dispatchEvent(new Event('load'))

    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves on error so a 404 remoteEntry cannot hang the loader', async () => {
    const url = '/broken/remoteEntry.js'
    const script = addScriptTag(url)

    const promise = loadScriptOnce(url, () => false)
    script.dispatchEvent(new Event('error'))

    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves via timeout when the tag never fires an event', async () => {
    vi.useFakeTimers()
    const url = '/silent/remoteEntry.js'
    addScriptTag(url)

    const promise = loadScriptOnce(url, () => false)
    const tracked = track(promise)

    await Promise.resolve()
    expect(tracked.settled).toBe(false)

    await vi.advanceTimersByTimeAsync(SCRIPT_LOAD_TIMEOUT_MS)
    await expect(promise).resolves.toBeUndefined()
  })

  it('dedupes concurrent callers for the same URL to one promise', async () => {
    const url = '/dedupe/remoteEntry.js'
    const script = addScriptTag(url)

    const a = loadScriptOnce(url, () => false)
    const b = loadScriptOnce(url, () => false)
    expect(a).toBe(b)

    script.dispatchEvent(new Event('load'))
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined])
  })
})

describe('toLazyDynamicComponent (classic remote boundary)', () => {
  const MODULE = 'test-plugin'
  const COMPONENT = './TestPanel'
  const safeId = toSafeModuleId(MODULE)

  afterEach(() => {
    document.head.querySelectorAll('script[src]').forEach((s) => s.remove())
    delete (window as Record<string, unknown>)[safeId]
  })

  it('waits for a classic script to load, then renders the remote component', async () => {
    // The remote's script is injected but has not executed yet, so its global
    // is absent when the lazy loader first runs — the production race.
    const script = addScriptTag(`/${MODULE}/remoteEntry.js`)

    const RemotePanel = () =>
      React.createElement('div', null, 'remote panel ok')
    const container = {
      init: () => undefined,
      get: () => Promise.resolve(() => ({ default: RemotePanel }))
    }

    const Lazy = toLazyDynamicComponent(MODULE, COMPONENT)
    render(
      React.createElement(
        Suspense,
        { fallback: React.createElement('div', null, 'loading') },
        React.createElement(Lazy)
      )
    )

    // Simulate the classic remote executing: it registers its global, then the
    // script's load event fires and the loader re-reads the global.
    ;(window as Record<string, unknown>)[safeId] = container
    script.dispatchEvent(new Event('load'))

    await waitFor(() =>
      expect(screen.getByText('remote panel ok')).toBeInTheDocument()
    )
    expect(screen.queryByText(/is not available/)).not.toBeInTheDocument()
  })
})
