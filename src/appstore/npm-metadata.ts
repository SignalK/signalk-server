/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'fs'
import path from 'path'
import { createDebug } from '../debug'

const debug = createDebug('signalk-server:appstore:npm-metadata')

const FETCH_TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — matches the plugin detail TTL

// npm's /-/v1/search endpoint strips the signalk.* key from each search hit,
// so plugins discovered via findModulesWithKeyword don't have appIcon,
// screenshots, requires, recommends, or the author-declared displayName on
// their ModuleInfo. The per-version endpoint at
//   https://registry.npmjs.org/<pkg>/<version>
// returns the full package.json including the signalk key. Fetching it per
// plugin would blow up the list endpoint (400+ plugins × 1 request), but
// it's cheap on the detail endpoint which only loads one plugin at a time.
//
// We cache responses to $configPath/appstore-cache/npm-metadata/<safeName>.json
// with a 6h TTL so repeat hits on the same plugin detail page don't re-fetch.

export interface NpmPackageMetadata {
  name: string
  version: string
  signalk?: {
    displayName?: string
    appIcon?: string
    screenshots?: unknown
    deprecated?: boolean
    requires?: unknown
    recommends?: unknown
  }
  repository?: string | { type?: string; url?: string }
  readme?: string
  [key: string]: unknown
}

interface CachedEntry {
  writtenAt: number
  payload: NpmPackageMetadata
}

export interface NpmMetadataClient {
  get(name: string, version: string): Promise<NpmPackageMetadata | undefined>
  invalidate(): void
}

function safeName(pkg: string): string {
  return pkg.replace(/\//g, '__')
}

async function fetchPackageMetadata(
  name: string,
  version: string
): Promise<NpmPackageMetadata | undefined> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace(
    '%40',
    '@'
  )}/${encodeURIComponent(version)}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!res.ok) {
      debug.enabled && debug('GET %s returned %d', url, res.status)
      return undefined
    }
    return (await res.json()) as NpmPackageMetadata
  } catch (err) {
    debug.enabled && debug('GET %s failed: %O', url, err)
    return undefined
  }
}

export function createNpmMetadataClient(cacheDir: string): NpmMetadataClient {
  const dir = path.join(cacheDir, 'npm-metadata')

  function ensureDir() {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      debug.enabled && debug('mkdir %s failed: %O', dir, err)
    }
  }

  function fileFor(name: string, version: string): string {
    return path.join(dir, `${safeName(name)}@${version}.json`)
  }

  function readDiskRaw(name: string, version: string): CachedEntry | undefined {
    try {
      const file = fileFor(name, version)
      if (!fs.existsSync(file)) return undefined
      return JSON.parse(fs.readFileSync(file, 'utf8')) as CachedEntry
    } catch (err) {
      debug.enabled && debug('readDisk failed: %O', err)
      return undefined
    }
  }

  function readDisk(name: string, version: string): CachedEntry | undefined {
    const entry = readDiskRaw(name, version)
    if (!entry) return undefined
    if (Date.now() - entry.writtenAt > CACHE_TTL_MS) return undefined
    return entry
  }

  function writeDisk(
    name: string,
    version: string,
    payload: NpmPackageMetadata
  ) {
    ensureDir()
    try {
      fs.writeFileSync(
        fileFor(name, version),
        JSON.stringify({
          writtenAt: Date.now(),
          payload
        } satisfies CachedEntry),
        'utf8'
      )
    } catch (err) {
      debug.enabled && debug('writeDisk failed: %O', err)
    }
  }

  return {
    async get(name, version) {
      const disk = readDisk(name, version)
      if (disk) return disk.payload
      const fresh = await fetchPackageMetadata(name, version)
      if (fresh) {
        writeDisk(name, version, fresh)
        return fresh
      }
      // Network unreachable. A stale cache entry is strictly more useful
      // than nothing — the alternative is the page degrading to "no
      // signalk metadata" until npm comes back.
      const stale = readDiskRaw(name, version)
      return stale?.payload
    },
    invalidate() {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      } catch (err) {
        debug.enabled && debug('invalidate failed: %O', err)
      }
    }
  }
}
