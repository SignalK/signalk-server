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
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm'

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
