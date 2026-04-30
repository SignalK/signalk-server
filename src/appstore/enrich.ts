/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { Value } from '@sinclair/typebox/value'
import { createDebug } from '../debug'
import {
  changelogUrlFor,
  isAbsoluteUrl,
  readmeUrlFor,
  resolveScreenshotUrl
} from './cdn'
import { computeIndicators, IndicatorInputs } from './indicators'
import {
  AppStoreEntryExtension,
  SignalKPackageMetadata,
  SignalKPackageMetadataSchema
} from './schemas'

const debug = createDebug('signalk-server:appstore:enrich')

const MAX_SCREENSHOTS = 6
const DEPRECATED_KEYWORD = 'signalk-deprecated'
const OFFICIAL_PREFIX = '@signalk/'

interface NpmPackageLike {
  name: string
  version: string
  keywords?: string[]
  description?: string
  readme?: string
  links?: {
    npm?: string
    homepage?: string
    repository?: string
    bugs?: string
  }
  repository?: string | { type?: string; url?: string }
  bugs?: string | { url?: string }
  signalk?: unknown
}

function isGithubUrl(url: string | undefined): boolean {
  // Require a real boundary in front of github.com so a URL containing
  // 'notgithub.com' followed by 'github.com' later in the path can't
  // accidentally match. ':\\/' covers https:// and git+ssh://;
  // '@' covers the ssh form (git@github.com:...).
  return !!url && /(^|:\/\/|@)github\.com[/:]/i.test(url)
}

function extractGithubUrl(pkg: NpmPackageLike): string | undefined {
  const candidates: Array<string | undefined> = []
  if (pkg.links?.repository) candidates.push(pkg.links.repository)
  if (typeof pkg.repository === 'string') candidates.push(pkg.repository)
  else if (pkg.repository?.url) candidates.push(pkg.repository.url)
  for (const c of candidates) {
    if (c && isGithubUrl(c)) {
      return c
        .replace(/^git\+/, '')
        .replace(/^git:\/\//, 'https://')
        .replace(/\.git$/, '')
        .replace(/^git@github\.com:/, 'https://github.com/')
    }
  }
  return undefined
}

function extractIssuesUrl(pkg: NpmPackageLike): string | undefined {
  if (pkg.links?.bugs) return pkg.links.bugs
  if (typeof pkg.bugs === 'string') return pkg.bugs
  if (pkg.bugs?.url) return pkg.bugs.url
  const gh = extractGithubUrl(pkg)
  return gh ? `${gh}/issues` : undefined
}

function parseSignalKMetadata(
  pkg: NpmPackageLike
): SignalKPackageMetadata | undefined {
  if (!pkg.signalk || typeof pkg.signalk !== 'object') return undefined
  if (Value.Check(SignalKPackageMetadataSchema, pkg.signalk)) {
    return pkg.signalk as SignalKPackageMetadata
  }
  debug.enabled &&
    debug(
      '%s: signalk key did not match schema; falling back to loose parse',
      pkg.name
    )
  const loose = pkg.signalk as Record<string, unknown>
  return {
    displayName:
      typeof loose.displayName === 'string' ? loose.displayName : undefined,
    appIcon: typeof loose.appIcon === 'string' ? loose.appIcon : undefined,
    screenshots: Array.isArray(loose.screenshots)
      ? (loose.screenshots.filter((s) => typeof s === 'string') as string[])
      : undefined,
    deprecated:
      typeof loose.deprecated === 'boolean' ? loose.deprecated : undefined,
    requires: Array.isArray(loose.requires)
      ? (loose.requires.filter((s) => typeof s === 'string') as string[])
      : undefined,
    recommends: Array.isArray(loose.recommends)
      ? (loose.recommends.filter((s) => typeof s === 'string') as string[])
      : undefined
  }
}

/**
 * A cache of pre-probed CDN URLs. When the author's declared signalk.appIcon
 * or signalk.screenshots[] path 404s on unpkg (common when source assets live
 * in ./public/, ./assets/, etc. but the declared path is relative to the
 * repo root), a background probe discovers the real URL and stores it here.
 * enrichEntry consults the cache and, if a resolution is known, uses it
 * instead of the naive package-relative URL.
 */
export type ProbedUrlLookup = (
  pkg: string,
  version: string,
  declaredPath: string
) => string | null | undefined

function defaultResolve(
  pkg: string,
  version: string,
  declaredPath: string,
  lookup?: ProbedUrlLookup
): string {
  const cached = lookup?.(pkg, version, declaredPath)
  if (cached) return cached
  return resolveScreenshotUrl(pkg, version, declaredPath)
}

function resolveScreenshotList(
  pkg: NpmPackageLike,
  meta: SignalKPackageMetadata | undefined,
  lookup?: ProbedUrlLookup
): string[] {
  const raw = meta?.screenshots
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim() === '') continue
    const resolved = isAbsoluteUrl(entry)
      ? entry
      : defaultResolve(pkg.name, pkg.version, entry, lookup)
    out.push(resolved)
    if (out.length >= MAX_SCREENSHOTS) break
  }
  return out
}

function resolveAppIcon(
  pkg: NpmPackageLike,
  meta: SignalKPackageMetadata | undefined,
  lookup?: ProbedUrlLookup
): string | undefined {
  const icon = meta?.appIcon
  if (!icon || typeof icon !== 'string' || icon.trim() === '') return undefined
  return isAbsoluteUrl(icon)
    ? icon
    : defaultResolve(pkg.name, pkg.version, icon, lookup)
}

function isDeprecated(
  pkg: NpmPackageLike,
  meta: SignalKPackageMetadata | undefined
): boolean {
  if (meta?.deprecated === true) return true
  return (pkg.keywords || []).includes(DEPRECATED_KEYWORD)
}

function isOfficial(pkg: NpmPackageLike): boolean {
  return pkg.name.startsWith(OFFICIAL_PREFIX)
}

function normalizeNameList(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.length > 0 ? out : undefined
}

export interface EnrichmentOptions {
  indicatorInputs?: Partial<IndicatorInputs>
  includeIndicators?: boolean
  iconUrlLookup?: ProbedUrlLookup
}

export function enrichEntry(
  pkg: NpmPackageLike,
  options: EnrichmentOptions = {}
): AppStoreEntryExtension {
  const meta = parseSignalKMetadata(pkg)
  const screenshots = resolveScreenshotList(pkg, meta, options.iconUrlLookup)
  const appIcon = resolveAppIcon(pkg, meta, options.iconUrlLookup)
  const githubUrl = extractGithubUrl(pkg)
  const issuesUrl = extractIssuesUrl(pkg)
  const deprecated = isDeprecated(pkg, meta)
  const official = isOfficial(pkg)

  const result: AppStoreEntryExtension = {
    displayName: meta?.displayName,
    appIcon,
    screenshots: screenshots.length > 0 ? screenshots : undefined,
    official,
    deprecated,
    readmeUrl: readmeUrlFor(pkg.name, pkg.version),
    changelogUrl: changelogUrlFor(pkg.name, pkg.version),
    githubUrl,
    issuesUrl,
    requires: normalizeNameList(meta?.requires),
    recommends: normalizeNameList(meta?.recommends)
  }

  if (options.includeIndicators) {
    result.indicators = computeIndicators({
      hasRepository: !!githubUrl,
      githubUrl,
      hasScreenshots: screenshots.length > 0,
      hasAppIcon: !!appIcon,
      description: pkg.description,
      readme: pkg.readme,
      keywords: pkg.keywords,
      ...(options.indicatorInputs || {})
    })
  }

  return result
}
