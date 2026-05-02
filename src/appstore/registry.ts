/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { type Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import fs from 'fs'
import path from 'path'
import { createDebug } from '../debug'
import { safeName } from './safe-name'
import { type IndicatorCheck, PluginCiSchema } from './schemas'

const debug = createDebug('signalk-server:appstore:registry')

const DEFAULT_REGISTRY_BASE = 'https://dirkwa.github.io/signalk-plugin-registry'
const INDEX_TTL_MS = 60 * 60 * 1000 // 1 hour
const PLUGIN_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const FETCH_TIMEOUT_MS = 20_000

export const RegistryBadgeSchema = Type.Union([
  Type.Literal('compatible'),
  Type.Literal('loads'),
  Type.Literal('activates'),
  Type.Literal('has-providers'),
  Type.Literal('tested'),
  Type.Literal('tests-failing'),
  Type.Literal('npm-audit-ok'),
  Type.Literal('audit-moderate'),
  Type.Literal('audit-high'),
  Type.Literal('audit-critical'),
  Type.Literal('broken'),
  Type.String()
])
export type RegistryBadge = Static<typeof RegistryBadgeSchema>

export const RegistryIndexEntrySchema = Type.Object({
  name: Type.String(),
  version: Type.Optional(Type.String()),
  composite_stable: Type.Optional(Type.Number()),
  badges_stable: Type.Optional(Type.Array(RegistryBadgeSchema)),
  test_status: Type.Optional(Type.String()),
  last_tested: Type.Optional(Type.String()),
  installs: Type.Optional(Type.Boolean()),
  loads: Type.Optional(Type.Boolean()),
  activates: Type.Optional(Type.Boolean()),
  providers: Type.Optional(Type.Array(Type.String())),
  // Upstream metrics published by signalk-plugin-registry >= 0.3.0.
  // Fetched nightly with an authenticated GITHUB_TOKEN so individual
  // signalk-server installs don't each hit api.github.com's 60/hr
  // unauthenticated limit. Any subset may be absent.
  stars: Type.Optional(Type.Number()),
  open_issues: Type.Optional(Type.Number()),
  contributors: Type.Optional(Type.Number()),
  downloads_per_week: Type.Optional(Type.Number()),
  github_url: Type.Optional(Type.String()),
  // plugin-ci matrix published by signalk-plugin-registry >= 0.4.0.
  // Same wire shape as PluginCiSchema in src/appstore/schemas.ts.
  plugin_ci: Type.Optional(PluginCiSchema)
})
export type RegistryIndexEntry = Static<typeof RegistryIndexEntrySchema>

export const RegistryIndexSchema = Type.Object({
  generated: Type.Optional(Type.String()),
  server_version: Type.Optional(Type.String()),
  plugin_count: Type.Optional(Type.Number()),
  plugins: Type.Array(RegistryIndexEntrySchema)
})
export type RegistryIndex = Static<typeof RegistryIndexSchema>

export const RegistryPluginVersionRunSchema = Type.Object({
  tested: Type.Optional(Type.String()),
  server_version: Type.Optional(Type.String()),
  installs: Type.Optional(Type.Boolean()),
  loads: Type.Optional(Type.Boolean()),
  activates: Type.Optional(Type.Boolean()),
  has_schema: Type.Optional(Type.Boolean()),
  has_own_tests: Type.Optional(Type.Boolean()),
  own_tests_pass: Type.Optional(Type.Boolean()),
  tests_runnable: Type.Optional(Type.Boolean()),
  has_install_scripts: Type.Optional(Type.Boolean()),
  audit_critical: Type.Optional(Type.Number()),
  audit_high: Type.Optional(Type.Number()),
  audit_moderate: Type.Optional(Type.Number()),
  composite: Type.Optional(Type.Number()),
  badges: Type.Optional(Type.Array(RegistryBadgeSchema)),
  test_status: Type.Optional(Type.String()),
  detected_providers: Type.Optional(Type.Array(Type.String())),
  unstubbed_accesses: Type.Optional(Type.Array(Type.Unknown()))
})
export type RegistryPluginVersionRun = Static<
  typeof RegistryPluginVersionRunSchema
>

export const RegistryPluginDetailSchema = Type.Object({
  name: Type.String(),
  versions: Type.Record(
    Type.String(),
    Type.Record(Type.String(), RegistryPluginVersionRunSchema)
  )
})
export type RegistryPluginDetail = Static<typeof RegistryPluginDetailSchema>

export interface RegistryClientOptions {
  baseUrl?: string
  cacheDir?: string
  indexTtlMs?: number
  pluginTtlMs?: number
  fetchTimeoutMs?: number
}

// Cache envelope schemas. The on-disk payload is JSON written by us, but
// past releases or partially-written files can leave a malformed or
// stale-shaped record on disk. Validating with the same TypeBox schemas
// the network path uses keeps the boundary check uniform.
const IndexEntrySchema = Type.Object({
  writtenAt: Type.Number(),
  payload: RegistryIndexSchema
})
type IndexEntry = Static<typeof IndexEntrySchema>

const PluginEntrySchema = Type.Object({
  writtenAt: Type.Number(),
  payload: RegistryPluginDetailSchema
})
type PluginEntry = Static<typeof PluginEntrySchema>

export interface RegistryClient {
  getIndex(): Promise<RegistryIndex | undefined>
  getPlugin(name: string): Promise<RegistryPluginDetail | undefined>
  getIndexEntry(name: string): Promise<RegistryIndexEntry | undefined>
  invalidate(): void
  baseUrl(): string
}

async function fetchJson<T>(
  url: string,
  schema: Parameters<typeof Value.Check>[0],
  timeoutMs: number
): Promise<T | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      debug.enabled && debug('GET %s returned %d', url, res.status)
      return undefined
    }
    const body = await res.json()
    if (!Value.Check(schema, body)) {
      debug.enabled && debug('GET %s returned unexpected shape', url)
      return undefined
    }
    return body as T
  } catch (err) {
    debug.enabled && debug('GET %s failed: %O', url, err)
    return undefined
  }
}

export function createRegistryClient(
  options: RegistryClientOptions = {}
): RegistryClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_REGISTRY_BASE).replace(/\/+$/, '')
  const indexTtl = options.indexTtlMs ?? INDEX_TTL_MS
  const pluginTtl = options.pluginTtlMs ?? PLUGIN_TTL_MS
  const timeoutMs = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS

  const cacheDir = options.cacheDir
    ? path.join(options.cacheDir, 'registry')
    : undefined
  const indexFile = cacheDir ? path.join(cacheDir, 'index.json') : undefined
  const pluginsDir = cacheDir ? path.join(cacheDir, 'plugins') : undefined

  function ensureDir(dir: string) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      debug.enabled && debug('mkdir %s failed: %O', dir, err)
    }
  }

  function readIndexFromDisk(): IndexEntry | undefined {
    if (!indexFile) return undefined
    try {
      if (!fs.existsSync(indexFile)) return undefined
      const raw = fs.readFileSync(indexFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (!Value.Check(IndexEntrySchema, parsed)) {
        debug.enabled &&
          debug('readIndex: cached file failed schema validation')
        return undefined
      }
      return parsed
    } catch (err) {
      debug.enabled && debug('readIndex failed: %O', err)
      return undefined
    }
  }

  function writeIndexToDisk(payload: RegistryIndex) {
    if (!cacheDir || !indexFile) return
    ensureDir(cacheDir)
    const entry: IndexEntry = { writtenAt: Date.now(), payload }
    try {
      fs.writeFileSync(indexFile, JSON.stringify(entry), 'utf8')
    } catch (err) {
      debug.enabled && debug('writeIndex failed: %O', err)
    }
  }

  function readPluginFromDisk(name: string): PluginEntry | undefined {
    if (!pluginsDir) return undefined
    try {
      const file = path.join(pluginsDir, `${safeName(name)}.json`)
      if (!fs.existsSync(file)) return undefined
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!Value.Check(PluginEntrySchema, parsed)) {
        debug.enabled &&
          debug('readPlugin %s: cached file failed schema validation', name)
        return undefined
      }
      return parsed
    } catch (err) {
      debug.enabled && debug('readPlugin failed for %s: %O', name, err)
      return undefined
    }
  }

  function writePluginToDisk(name: string, payload: RegistryPluginDetail) {
    if (!pluginsDir) return
    ensureDir(pluginsDir)
    const entry: PluginEntry = { writtenAt: Date.now(), payload }
    try {
      fs.writeFileSync(
        path.join(pluginsDir, `${safeName(name)}.json`),
        JSON.stringify(entry),
        'utf8'
      )
    } catch (err) {
      debug.enabled && debug('writePlugin failed for %s: %O', name, err)
    }
  }

  let indexMemo: IndexEntry | undefined
  let lookupCache: Map<string, RegistryIndexEntry> | undefined
  // Coalesces concurrent callers when the cache is stale so we don't
  // fan out N parallel network fetches under load. One entry per
  // plugin for getPlugin(); a single cell for the index.
  let indexInFlight: Promise<RegistryIndex | undefined> | undefined
  const pluginInFlight: Map<
    string,
    Promise<RegistryPluginDetail | undefined>
  > = new Map()

  function buildLookup(idx: RegistryIndex): Map<string, RegistryIndexEntry> {
    const map = new Map<string, RegistryIndexEntry>()
    for (const entry of idx.plugins) {
      map.set(entry.name, entry)
    }
    return map
  }

  return {
    async getIndex(): Promise<RegistryIndex | undefined> {
      if (indexMemo && Date.now() - indexMemo.writtenAt < indexTtl) {
        return indexMemo.payload
      }
      const disk = readIndexFromDisk()
      if (disk && Date.now() - disk.writtenAt < indexTtl) {
        indexMemo = disk
        lookupCache = buildLookup(disk.payload)
        return disk.payload
      }
      if (indexInFlight) return indexInFlight
      indexInFlight = (async () => {
        const fresh = await fetchJson<RegistryIndex>(
          `${baseUrl}/index.json`,
          RegistryIndexSchema,
          timeoutMs
        )
        if (fresh) {
          indexMemo = { writtenAt: Date.now(), payload: fresh }
          lookupCache = buildLookup(fresh)
          writeIndexToDisk(fresh)
          return fresh
        }
        if (disk) {
          indexMemo = disk
          lookupCache = buildLookup(disk.payload)
          return disk.payload
        }
        return undefined
      })()
      try {
        return await indexInFlight
      } finally {
        indexInFlight = undefined
      }
    },

    async getIndexEntry(name: string): Promise<RegistryIndexEntry | undefined> {
      if (!lookupCache) {
        await this.getIndex()
      }
      return lookupCache?.get(name)
    },

    async getPlugin(name: string): Promise<RegistryPluginDetail | undefined> {
      const disk = readPluginFromDisk(name)
      if (disk && Date.now() - disk.writtenAt < pluginTtl) {
        return disk.payload
      }
      const existing = pluginInFlight.get(name)
      if (existing) return existing
      const promise = (async () => {
        const fresh = await fetchJson<RegistryPluginDetail>(
          `${baseUrl}/plugins/${safeName(name)}.json`,
          RegistryPluginDetailSchema,
          timeoutMs
        )
        if (fresh) {
          writePluginToDisk(name, fresh)
          return fresh
        }
        return disk?.payload
      })()
      pluginInFlight.set(name, promise)
      try {
        return await promise
      } finally {
        pluginInFlight.delete(name)
      }
    },

    invalidate() {
      indexMemo = undefined
      lookupCache = undefined
      indexInFlight = undefined
      pluginInFlight.clear()
      if (indexFile && fs.existsSync(indexFile)) {
        try {
          fs.unlinkSync(indexFile)
        } catch (err) {
          debug.enabled && debug('invalidate index failed: %O', err)
        }
      }
      if (pluginsDir && fs.existsSync(pluginsDir)) {
        try {
          fs.rmSync(pluginsDir, { recursive: true, force: true })
        } catch (err) {
          debug.enabled && debug('invalidate plugins dir failed: %O', err)
        }
      }
    },

    baseUrl() {
      return baseUrl
    }
  }
}

export function badgesToIndicators(
  badges: RegistryBadge[] | undefined,
  composite: number | undefined
): {
  score: number
  checks: IndicatorCheck[]
} {
  const checks: IndicatorCheck[] = []
  const set = new Set(badges ?? [])

  checks.push({
    id: 'compatible',
    status: set.has('compatible') ? 'ok' : 'fail',
    title: 'Installs successfully',
    subtitle: set.has('compatible')
      ? 'npm install --ignore-scripts succeeded'
      : 'Plugin failed to install'
  })
  checks.push({
    id: 'loads',
    status: set.has('loads') ? 'ok' : set.has('compatible') ? 'fail' : 'warn',
    title: 'Loads',
    subtitle: set.has('loads')
      ? 'Plugin constructor returns a valid object'
      : 'Plugin constructor did not return a valid object'
  })
  checks.push({
    id: 'activates',
    status: set.has('activates') ? 'ok' : set.has('loads') ? 'fail' : 'warn',
    title: 'Activates',
    subtitle: set.has('activates')
      ? 'start() completes with schema defaults'
      : 'start() did not complete with schema defaults'
  })

  if (set.has('tested')) {
    checks.push({
      id: 'tested',
      status: 'ok',
      title: 'Plugin test suite',
      subtitle: 'Plugin ships its own tests and they pass'
    })
  } else if (set.has('tests-failing')) {
    checks.push({
      id: 'tested',
      status: 'fail',
      title: 'Plugin test suite',
      subtitle: 'Plugin ships tests but they are failing'
    })
  } else {
    checks.push({
      id: 'tested',
      status: 'warn',
      title: 'Plugin test suite',
      subtitle: 'No plugin-level tests provided'
    })
  }

  if (set.has('npm-audit-ok')) {
    checks.push({
      id: 'audit',
      status: 'ok',
      title: 'Security audit',
      subtitle: 'No npm audit vulnerabilities'
    })
  } else if (set.has('audit-moderate')) {
    checks.push({
      id: 'audit',
      status: 'warn',
      title: 'Security audit',
      subtitle: 'Moderate vulnerabilities reported'
    })
  } else if (set.has('audit-high')) {
    checks.push({
      id: 'audit',
      status: 'warn',
      title: 'Security audit',
      subtitle: 'High severity vulnerabilities reported'
    })
  } else if (set.has('audit-critical')) {
    checks.push({
      id: 'audit',
      status: 'fail',
      title: 'Security audit',
      subtitle: 'Critical vulnerabilities reported'
    })
  } else {
    checks.push({
      id: 'audit',
      status: 'warn',
      title: 'Security audit',
      subtitle: 'Audit status unknown'
    })
  }

  if (set.has('has-providers')) {
    checks.push({
      id: 'has-providers',
      status: 'ok',
      title: 'Registers providers',
      subtitle: 'Registers one or more Signal K providers (informational)'
    })
  }

  return {
    score: typeof composite === 'number' ? composite : 0,
    checks
  }
}
