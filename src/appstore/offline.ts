/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { createDebug } from '../debug'
import { AppStoreCache } from './cache'

const debug = createDebug('signalk-server:appstore:offline')

interface InstalledModuleLike {
  packageName?: string
  name?: string
  version?: string
  id?: string
}

interface AppLike {
  plugins?: InstalledModuleLike[]
  webapps?: InstalledModuleLike[]
  addons?: InstalledModuleLike[]
  embeddablewebapps?: InstalledModuleLike[]
}

function installedAsEntries(app: AppLike): Record<string, unknown>[] {
  const sources: Array<
    [InstalledModuleLike[] | undefined, boolean, boolean, boolean]
  > = [
    [app.plugins, true, false, false],
    [app.webapps, false, true, false],
    [app.addons, false, true, false],
    [app.embeddablewebapps, false, true, true]
  ]

  const seen = new Set<string>()
  const entries: Record<string, unknown>[] = []

  for (const [list, isPlugin, isWebapp, isEmbeddableWebapp] of sources) {
    if (!list) continue
    for (const mod of list) {
      const name = mod.packageName || mod.name
      if (!name || seen.has(name)) continue
      seen.add(name)
      entries.push({
        name,
        version: mod.version ?? 'unknown',
        description: '',
        author: '',
        categories: [],
        updated: '',
        keywords: [],
        npmUrl: null,
        isPlugin,
        isWebapp,
        isEmbeddableWebapp,
        id: mod.id,
        installedVersion: mod.version
      })
    }
  }
  return entries
}

export function buildOfflineResponse(
  app: AppLike,
  cache: AppStoreCache
): Record<string, unknown> {
  const installed = installedAsEntries(app)
  // The TTL doesn't apply when we're already offline — a stale cached
  // list is strictly better than an empty fallback.
  const cachedList = cache.readListIgnoringTtl<Record<string, unknown>>()

  if (cachedList?.payload) {
    debug.enabled &&
      debug(
        'offline: falling back to cached list from %d',
        cachedList.writtenAt
      )
    // Live installed state still trumps whatever the cache recorded
    // earlier. A user who just installed a plugin while offline expects
    // it to show as installed even though the cached list predates it.
    return {
      ...cachedList.payload,
      installed,
      storeAvailable: false,
      fromCache: true,
      cacheAge: Date.now() - cachedList.writtenAt
    }
  }

  return {
    available: installed,
    installed,
    updates: [],
    installing: [],
    categories: ['All'],
    storeAvailable: false,
    isInDocker: process.env.IS_IN_DOCKER === 'true',
    fromCache: false
  }
}
