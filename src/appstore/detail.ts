/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { isRecent } from '../categories'
import { createDebug } from '../debug'
import { AppStoreCache } from './cache'
import { changelogUrlFor, readmeUrlFor } from './cdn'
import { fetchReleasesMarkdown, parseGithubSlug } from './github-releases'
import { computeIndicators } from './indicators'
import { DependencyReference, PluginDetailPayload } from './schemas'

const debug = createDebug('signalk-server:appstore:detail')

const DEFAULT_TIMEOUT_MS = 20_000

interface FetchOptions {
  timeoutMs?: number
}

// 'missing' = the server responded that the asset doesn't exist (e.g. 404
// because the plugin's tarball lacks CHANGELOG.md). Safe to treat as empty.
// 'error' = network/timeout/abort or 5xx; we don't know whether the asset
// exists, so the caller must not advertise it as missing.
type FetchTextResult =
  { kind: 'ok'; text: string } | { kind: 'missing' } | { kind: 'error' }

async function fetchText(
  url: string,
  options: FetchOptions = {}
): Promise<FetchTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      debug.enabled && debug('fetchText %s returned %d', url, res.status)
      // 5xx is a CDN/origin failure, not a definitive 'asset missing'
      // signal — the asset may still exist once the outage clears.
      if (res.status >= 500 && res.status < 600) return { kind: 'error' }
      return { kind: 'missing' }
    }
    return { kind: 'ok', text: await res.text() }
  } catch (err) {
    debug.enabled && debug('fetchText %s failed: %O', url, err)
    return { kind: 'error' }
  }
}

export interface PackageSummary {
  name: string
  version: string
  displayName?: string
  appIcon?: string
  screenshots: string[]
  official: boolean
  deprecated: boolean
  description?: string
  author?: string
  categories?: string[]
  npmUrl?: string
  isPlugin?: boolean
  isWebapp?: boolean
  keywords?: string[]
  npmReadme?: string
  githubUrl?: string
  lastReleaseDate?: string
  requires?: string[]
  recommends?: string[]
}

export interface DependencyLookup {
  displayName?: string
  appIcon?: string
  installed: boolean
}

export type DependencyResolver = (name: string) => DependencyLookup | undefined

function resolveDependencyList(
  names: string[] | undefined,
  resolver: DependencyResolver | undefined
): DependencyReference[] {
  if (!names || names.length === 0) return []
  return names.map((name) => {
    const lookup = resolver?.(name)
    return {
      name,
      displayName: lookup?.displayName,
      appIcon: lookup?.appIcon,
      installed: lookup?.installed ?? false
    }
  })
}

export async function buildPluginDetail(
  summary: PackageSummary,
  resolver?: DependencyResolver
): Promise<PluginDetailPayload> {
  let readmeText = ''
  if (summary.npmReadme && summary.npmReadme.trim().length > 0) {
    readmeText = summary.npmReadme
  } else {
    const fetched = await fetchText(readmeUrlFor(summary.name, summary.version))
    if (fetched.kind === 'ok') readmeText = fetched.text
  }

  // Prefer GitHub Releases as the changelog source — that's where most
  // plugin authors put real release notes. Fall back to a CHANGELOG.md in
  // the published tarball for packages not hosted on GitHub. Rendered to
  // Markdown via unified/rehype-remark so the existing Changelog tab
  // renders release notes directly.
  let changelog = ''
  let changelogFormat: PluginDetailPayload['changelogFormat'] = 'synthesized'

  const slug = parseGithubSlug(summary.githubUrl)
  if (slug) {
    const releases = await fetchReleasesMarkdown(slug.owner, slug.repo)
    if (releases && releases.trim()) {
      changelog = releases
      changelogFormat = 'markdown'
    }
  }

  if (!changelog) {
    const fetched = await fetchText(
      changelogUrlFor(summary.name, summary.version)
    )
    if (fetched.kind === 'ok' && fetched.text.trim().length > 0) {
      changelog = fetched.text
      changelogFormat = 'markdown'
    }
  }

  const indicators = computeIndicators({
    hasRepository: !!summary.githubUrl,
    githubUrl: summary.githubUrl,
    hasScreenshots: summary.screenshots.length > 0,
    hasAppIcon: !!summary.appIcon,
    description: summary.description,
    readme: readmeText,
    keywords: summary.keywords,
    lastReleaseDate: summary.lastReleaseDate
  })

  return {
    name: summary.name,
    version: summary.version,
    displayName: summary.displayName,
    appIcon: summary.appIcon,
    screenshots: summary.screenshots,
    official: summary.official,
    deprecated: summary.deprecated,
    description: summary.description,
    author: summary.author,
    categories: summary.categories,
    githubUrl: summary.githubUrl,
    npmUrl: summary.npmUrl,
    isPlugin: summary.isPlugin,
    isWebapp: summary.isWebapp,
    readme: readmeText,
    changelog,
    indicators,
    requires: resolveDependencyList(summary.requires, resolver),
    recommends: resolveDependencyList(summary.recommends, resolver),
    recent: isRecent(summary.lastReleaseDate),
    readmeFormat: 'markdown',
    changelogFormat,
    fetchedAt: Date.now(),
    fromCache: false
  }
}

export function readDetailFromCache(
  cache: AppStoreCache,
  name: string
): PluginDetailPayload | undefined {
  const cached = cache.readPluginDetail(name)
  return cached?.payload
}
