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

function normalizeRelPath(relPath: string): string {
  let clean = relPath.trim()
  while (clean.startsWith('./') || clean.startsWith('/')) {
    clean = clean.replace(/^\.?\//, '')
  }
  return clean
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
