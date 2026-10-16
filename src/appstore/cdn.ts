/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm'
const UNPKG_BASE = 'https://unpkg.com'
// In preference order. jsDelivr answers the first request for a file from
// a large package several times faster than unpkg, which unpacks the
// whole tarball first; unpkg stays as the fallback when jsDelivr fails.
const CDN_BASES = [JSDELIVR_BASE, UNPKG_BASE]

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

export function cdnUrlsFor(
  pkg: string,
  version: string,
  relPath: string
): string[] {
  const clean = normalizeRelPath(relPath)
  return CDN_BASES.map((base) => `${base}/${pkg}@${version}/${clean}`)
}

export function resolveScreenshotUrl(
  pkg: string,
  version: string,
  relPath: string
): string {
  return cdnUrlsFor(pkg, version, relPath)[0]
}

export function readmeUrlFor(pkg: string, version: string): string {
  return cdnUrlsFor(pkg, version, 'README.md')[0]
}

export function changelogUrlFor(pkg: string, version: string): string {
  return cdnUrlsFor(pkg, version, 'CHANGELOG.md')[0]
}

export function isAbsoluteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || url.startsWith('data:')
}
