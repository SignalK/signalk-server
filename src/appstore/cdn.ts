/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

const UNPKG_BASE = 'https://unpkg.com'
const UNPKG_HOST = new URL(UNPKG_BASE).hostname
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm'

const MAX_CDN_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

// Collapse `.` / `..` segments and clamp the result to the package
// root. `signalk.appIcon` / `signalk.screenshots` come from plugin
// authors' package.json, so a hostile or careless `../../etc/passwd`
// must not be allowed to escape into a sibling package's CDN namespace.
// Excess `..` is silently dropped (clamps to root); the resulting URL
// 404s harmlessly if the path doesn't exist in the tarball.
function normalizeRelPath(relPath: string): string {
  // package.json edited on Windows can land with backslashes; fold them
  // to forward slashes before the segment walk so '..\\x' is clamped too.
  const normalized = relPath.trim().replace(/\\/g, '/')
  const trimmed = normalized.replace(/^(?:\.?\/)+/, '')
  const stack: string[] = []
  for (const segment of trimmed.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

export function resolveScreenshotUrl(
  pkg: string,
  version: string,
  relPath: string
): string {
  const clean = normalizeRelPath(relPath)
  return `${UNPKG_BASE}/${pkg}@${version}/${clean}`
}

export function resolveScreenshotUrlJsdelivr(
  pkg: string,
  version: string,
  relPath: string
): string {
  const clean = normalizeRelPath(relPath)
  return `${JSDELIVR_BASE}/${pkg}@${version}/${clean}`
}

export function readmeUrlFor(pkg: string, version: string): string {
  return `${UNPKG_BASE}/${pkg}@${version}/README.md`
}

export function changelogUrlFor(pkg: string, version: string): string {
  return `${UNPKG_BASE}/${pkg}@${version}/CHANGELOG.md`
}

export function isAbsoluteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || url.startsWith('data:')
}

export function isCdnUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === UNPKG_HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === ''
  )
}

/**
 * fetch() restricted to the package CDN. Asset URLs derive from plugin
 * authors' package.json, so the server must not let them steer requests
 * at the vessel network or cloud metadata endpoints. Redirects are
 * followed by hand so every hop is checked against the CDN host; the
 * caller's init, including its abort signal, applies to the whole chain.
 */
export async function fetchFromCdn(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let current = url
  for (let redirects = 0; ; redirects++) {
    if (!isCdnUrl(current)) {
      throw new Error(`Refusing to fetch non-CDN URL ${current}`)
    }
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(res.status)) return res
    const location = res.headers.get('location')
    await res.body?.cancel()
    if (location === null || redirects === MAX_CDN_REDIRECTS) {
      throw new Error(`Cannot follow redirect from ${current}`)
    }
    current = new URL(location, current).href
  }
}
