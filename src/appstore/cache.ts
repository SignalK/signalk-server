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
import { safeName } from './safe-name'
import { PluginDetailPayload } from './types'

const debug = createDebug('signalk-server:appstore:cache')

const LIST_TTL_MS = 60 * 60 * 1000 // 1 hour
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

interface CachedList<T> {
  writtenAt: number
  payload: T
}

interface CachedDetail {
  writtenAt: number
  installed: boolean
  payload: PluginDetailPayload
}

export interface AppStoreCache {
  readList<T>(): CachedList<T> | undefined
  readListIgnoringTtl<T>(): CachedList<T> | undefined
  writeList<T>(payload: T): void
  readPluginDetail(name: string): CachedDetail | undefined
  writePluginDetail(detail: PluginDetailPayload, installed: boolean): void
  invalidateList(): void
  invalidatePluginDetail(name: string): void
  invalidateAllPluginDetail(): void
  cacheRoot(): string
}

export function createCache(configPath: string): AppStoreCache {
  const root = path.join(configPath, 'appstore-cache')
  const listFile = path.join(root, 'list.json')
  const pluginsDir = path.join(root, 'plugins')

  function ensureRoot() {
    try {
      fs.mkdirSync(pluginsDir, { recursive: true })
    } catch (err) {
      debug.enabled &&
        debug('failed to create cache dir %s: %O', pluginsDir, err)
    }
  }

  function pluginDir(name: string): string {
    return path.join(pluginsDir, safeName(name))
  }

  function isFresh(writtenAt: number, ttl: number, installed = false): boolean {
    // Cached detail for an installed plugin is treated as fresh
    // indefinitely. The on-disk plugin tarball is the source of truth
    // for installed plugins (we render its README/CHANGELOG locally),
    // so the cache only ages out when the plugin is uninstalled or
    // the user clicks Refresh. This also keeps the detail tab usable
    // offline — npm being unreachable doesn't blank the cached
    // README/Changelog/Indicators for plugins the user already runs.
    if (installed) return true
    return Date.now() - writtenAt < ttl
  }

  function readListRaw<T>(): CachedList<T> | undefined {
    try {
      if (!fs.existsSync(listFile)) return undefined
      const raw = fs.readFileSync(listFile, 'utf8')
      return JSON.parse(raw) as CachedList<T>
    } catch (err) {
      debug.enabled && debug('readList failed: %O', err)
      return undefined
    }
  }

  return {
    readList<T>(): CachedList<T> | undefined {
      const parsed = readListRaw<T>()
      if (!parsed) return undefined
      if (!isFresh(parsed.writtenAt, LIST_TTL_MS)) return undefined
      return parsed
    },

    // Bypass the TTL — offline.ts uses this when the live store is
    // unreachable so we can still serve a stale snapshot rather than
    // empty results.
    readListIgnoringTtl<T>(): CachedList<T> | undefined {
      return readListRaw<T>()
    },

    writeList<T>(payload: T) {
      ensureRoot()
      const record: CachedList<T> = { writtenAt: Date.now(), payload }
      try {
        fs.writeFileSync(listFile, JSON.stringify(record), 'utf8')
      } catch (err) {
        debug.enabled && debug('writeList failed: %O', err)
      }
    },

    readPluginDetail(name: string): CachedDetail | undefined {
      try {
        const file = path.join(pluginDir(name), 'detail.json')
        if (!fs.existsSync(file)) return undefined
        const raw = fs.readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw) as CachedDetail
        if (!isFresh(parsed.writtenAt, DETAIL_TTL_MS, parsed.installed)) {
          return undefined
        }
        return parsed
      } catch (err) {
        debug.enabled && debug('readPluginDetail failed for %s: %O', name, err)
        return undefined
      }
    },

    writePluginDetail(detail: PluginDetailPayload, installed: boolean) {
      ensureRoot()
      const dir = pluginDir(detail.name)
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (err) {
        debug.enabled && debug('mkdir failed for %s: %O', dir, err)
      }
      const record: CachedDetail = {
        writtenAt: Date.now(),
        installed,
        payload: { ...detail, fromCache: true }
      }
      try {
        fs.writeFileSync(
          path.join(dir, 'detail.json'),
          JSON.stringify(record),
          'utf8'
        )
      } catch (err) {
        debug.enabled &&
          debug('writePluginDetail failed for %s: %O', detail.name, err)
      }
    },

    invalidateList() {
      try {
        if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
      } catch (err) {
        debug.enabled && debug('invalidateList failed: %O', err)
      }
    },

    invalidatePluginDetail(name: string) {
      try {
        const file = path.join(pluginDir(name), 'detail.json')
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch (err) {
        debug.enabled &&
          debug('invalidatePluginDetail failed for %s: %O', name, err)
      }
    },

    invalidateAllPluginDetail() {
      try {
        if (fs.existsSync(pluginsDir)) {
          fs.rmSync(pluginsDir, { recursive: true, force: true })
        }
      } catch (err) {
        debug.enabled && debug('invalidateAllPluginDetail failed: %O', err)
      }
    },

    cacheRoot() {
      return root
    }
  }
}

export const LIST_TTL = LIST_TTL_MS
export const DETAIL_TTL = DETAIL_TTL_MS
