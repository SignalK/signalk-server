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

const debug = createDebug('signalk-server:appstore:raw-metrics')

const FETCH_TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — matches detail TTL

export interface RawMetricsSample {
  stars?: number
  openIssues?: number
  contributors?: number
  downloadsPerWeek?: number
  /** Optional: the upstream sources we actually got data from. Informational only. */
  sources?: {
    github?: boolean
    npm?: boolean
    contributors?: boolean
  }
}

interface CachedEntry {
  writtenAt: number
  payload: RawMetricsSample
}

export interface RawMetricsClient {
  get(
    pkgName: string,
    githubUrl: string | undefined
  ): Promise<RawMetricsSample | undefined>
  invalidate(): void
}

// Minimal GitHub slug parser mirrors github-releases.ts but stays self-contained
// so this module doesn't add an import cycle. Returns {owner, repo} or undefined.
// Repo segment may contain dots (e.g. github.com/org/my.plugin), but the
// trailing ".git" suffix is repository-system noise we strip explicitly.
const GITHUB_SLUG_RE =
  /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[?#/].*)?$/i

function parseSlug(
  url: string | undefined
): { owner: string; repo: string } | undefined {
  if (!url) return undefined
  const m = GITHUB_SLUG_RE.exec(url)
  if (!m) return undefined
  return { owner: m[1], repo: m[2] }
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) {
      debug.enabled && debug('GET %s returned %d', url, res.status)
      return undefined
    }
    return (await res.json()) as T
  } catch (err) {
    debug.enabled && debug('GET %s failed: %O', url, err)
    return undefined
  }
}

interface GithubRepoResponse {
  stargazers_count?: number
  // open_issues_count counts open issues AND open pull requests, which is
  // not what users mean by "open issues" — we fetch the real number from
  // the search API instead. Keeping the field here for completeness only.
  open_issues_count?: number
  [key: string]: unknown
}

interface GithubSearchIssuesResponse {
  total_count?: number
  [key: string]: unknown
}

interface NpmDownloadsResponse {
  downloads?: number
  start?: string
  end?: string
  package?: string
}

type GithubContributorsResponse = unknown[]

async function fetchGithubRepo(
  owner: string,
  repo: string
): Promise<{ stars?: number } | undefined> {
  const body = await fetchJson<GithubRepoResponse>(
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(repo)}`
  )
  if (!body) return undefined
  return {
    stars:
      typeof body.stargazers_count === 'number'
        ? body.stargazers_count
        : undefined
  }
}

async function fetchOpenIssueCount(
  owner: string,
  repo: string
): Promise<number | undefined> {
  // The repo endpoint's open_issues_count includes pull requests. Issues
  // search lets us scope to is:issue and gives us the real count.
  const q = `repo:${owner}/${repo}+is:issue+is:open`
  const body = await fetchJson<GithubSearchIssuesResponse>(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q).replace(
      /%2B/g,
      '+'
    )}&per_page=1`
  )
  if (!body) return undefined
  return typeof body.total_count === 'number' ? body.total_count : undefined
}

async function fetchContributorCount(
  owner: string,
  repo: string
): Promise<number | undefined> {
  // Ask for just 1 per page; github returns a Link header we could parse for
  // the last-page index. Without auth we may hit rate limits on popular
  // repos; we tolerate missing data rather than erroring out.
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(repo)}/contributors?per_page=1&anon=true`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' }
      }
    )
    if (!res.ok) return undefined
    const link = res.headers.get('link')
    if (link) {
      // GitHub's Link header for paginated lists contains "page=<N>" on the
      // rel="last" entry — that's the number of pages which equals the
      // number of contributors given per_page=1.
      const m = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!Number.isNaN(n)) return n
      }
    }
    // No Link header means 0 or 1 contributors — inspect body length.
    const body = (await res.json()) as GithubContributorsResponse
    return Array.isArray(body) ? body.length : undefined
  } catch (err) {
    debug.enabled && debug('contributors fetch failed: %O', err)
    return undefined
  }
}

async function fetchNpmWeeklyDownloads(
  pkgName: string
): Promise<number | undefined> {
  const body = await fetchJson<NpmDownloadsResponse>(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(
      pkgName
    ).replace('%40', '@')}`
  )
  return body && typeof body.downloads === 'number' ? body.downloads : undefined
}

export function createRawMetricsClient(cacheDir: string): RawMetricsClient {
  const dir = path.join(cacheDir, 'raw-metrics')

  function ensureDir() {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      debug.enabled && debug('mkdir %s failed: %O', dir, err)
    }
  }

  function fileFor(pkgName: string): string {
    return path.join(dir, `${safeName(pkgName)}.json`)
  }

  function readDisk(pkgName: string): CachedEntry | undefined {
    try {
      const file = fileFor(pkgName)
      if (!fs.existsSync(file)) return undefined
      const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as CachedEntry
      if (Date.now() - entry.writtenAt > CACHE_TTL_MS) return undefined
      return entry
    } catch (err) {
      debug.enabled && debug('readDisk failed: %O', err)
      return undefined
    }
  }

  function writeDisk(pkgName: string, payload: RawMetricsSample) {
    ensureDir()
    try {
      fs.writeFileSync(
        fileFor(pkgName),
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
    async get(pkgName, githubUrl) {
      const disk = readDisk(pkgName)
      if (disk) return disk.payload

      const slug = parseSlug(githubUrl)
      const sources: RawMetricsSample['sources'] = {}

      // Kick off all four in parallel. Each independently tolerates
      // failure — we assemble whatever we get back.
      const [repo, openIssues, contributors, downloads] = await Promise.all([
        slug ? fetchGithubRepo(slug.owner, slug.repo) : undefined,
        slug ? fetchOpenIssueCount(slug.owner, slug.repo) : undefined,
        slug ? fetchContributorCount(slug.owner, slug.repo) : undefined,
        fetchNpmWeeklyDownloads(pkgName)
      ])

      if (repo) sources.github = true
      if (typeof contributors === 'number') sources.contributors = true
      if (typeof downloads === 'number') sources.npm = true

      const sample: RawMetricsSample = {
        stars: repo?.stars,
        openIssues,
        contributors,
        downloadsPerWeek: downloads,
        sources:
          sources.github || sources.npm || sources.contributors
            ? sources
            : undefined
      }

      // Only persist if we actually got something useful. Empty samples
      // aren't worth caching and would delay a retry on the next visit.
      if (
        sample.stars !== undefined ||
        sample.openIssues !== undefined ||
        sample.contributors !== undefined ||
        sample.downloadsPerWeek !== undefined
      ) {
        writeDisk(pkgName, sample)
      }
      return sample
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
