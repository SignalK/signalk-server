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

// unified, rehype-parse, rehype-remark, remark-gfm and remark-stringify
// are ESM-only packages. tsc emits CommonJS, so static `import` lines
// would compile to `require()` calls that throw ERR_REQUIRE_ESM on
// Node versions before 22.12 (where require-of-ESM is opt-in). Lazy
// dynamic `import()` works on every supported Node — see
// loadHtmlProcessor below.

const debug = createDebug('signalk-server:appstore:github-releases')

const FETCH_TIMEOUT_MS = 15_000

export interface GithubReleaseEntry {
  tag: string
  url: string
  date?: string
  bodyMarkdown: string
}

// Minimal atom-feed extraction tuned to the shape github.com/<owner>/<repo>/releases.atom produces.
// Each <entry> has <title>v1.2.3</title>, <updated>2026-…</updated>,
// <link rel="alternate" href=".../releases/tag/v1.2.3"/>, and <content type="html">&lt;h2&gt;…</content>.
const ENTRY_RE = /<entry\b[\s\S]*?<\/entry>/g
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/
const UPDATED_RE = /<updated[^>]*>([\s\S]*?)<\/updated>/
// Extract <link> tags first, then read attributes by name. The XML spec
// doesn't guarantee attribute order — matching `rel="..." href="..."`
// in one regex would miss feeds that emit href before rel.
const LINK_TAG_RE = /<link\b([^>]*)\/?>/g
const ATTR_RE = (name: string) => new RegExp(`\\b${name}=["']([^"']+)["']`)
const CONTENT_RE = /<content[^>]*>([\s\S]*?)<\/content>/

function extractAlternateLink(entryXml: string): string | undefined {
  let m: RegExpExecArray | null
  LINK_TAG_RE.lastIndex = 0
  while ((m = LINK_TAG_RE.exec(entryXml))) {
    const attrs = m[1]
    const rel = ATTR_RE('rel').exec(attrs)?.[1]
    if (rel === undefined || rel === 'alternate') {
      const href = ATTR_RE('href').exec(attrs)?.[1]
      if (href) return href
    }
  }
  return undefined
}

// Cache the processor across calls so we only pay the dynamic-import
// cost once per process. Build is async because the underlying packages
// are ESM-only.
type HtmlProcessor = { process(input: string): Promise<{ toString(): string }> }
let htmlProcessorPromise: Promise<HtmlProcessor> | undefined

async function loadHtmlProcessor(): Promise<HtmlProcessor> {
  if (htmlProcessorPromise) return htmlProcessorPromise
  htmlProcessorPromise = (async () => {
    const { unified } = await import('unified')
    const { default: rehypeParse } = await import('rehype-parse')
    const { default: rehypeRemark } = await import('rehype-remark')
    const { default: remarkGfm } = await import('remark-gfm')
    const { default: remarkStringify } = await import('remark-stringify')
    return unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify, {
        bullet: '-',
        fences: true,
        emphasis: '_',
        strong: '*'
      }) as unknown as HtmlProcessor
  })()
  return htmlProcessorPromise
}

// String.fromCodePoint throws RangeError for values outside [0, 0x10FFFF],
// which would otherwise abort htmlToMarkdown on a malformed entity (e.g.
// &#99999999; or &#xFFFFFFFF;) and degrade the Changelog tab to raw HTML.
function safeFromCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return ''
  return String.fromCodePoint(n)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeFromCodePoint(parseInt(n, 16)))
}

async function htmlToMarkdown(html: string): Promise<string> {
  try {
    const processor = await loadHtmlProcessor()
    const file = await processor.process(html)
    return String(file).trim()
  } catch (err) {
    debug.enabled && debug('htmlToMarkdown failed: %O', err)
    return html
  }
}

function parseEntry(entryXml: string): {
  tag?: string
  url?: string
  date?: string
  contentHtml?: string
} {
  const title = TITLE_RE.exec(entryXml)?.[1]
  const updated = UPDATED_RE.exec(entryXml)?.[1]
  const href = extractAlternateLink(entryXml)
  const content = CONTENT_RE.exec(entryXml)?.[1]
  return {
    tag: title ? decodeEntities(title).trim() : undefined,
    url: href,
    date: updated,
    contentHtml: content ? decodeEntities(content) : undefined
  }
}

export async function fetchReleasesFeed(
  owner: string,
  repo: string
): Promise<string | undefined> {
  const url = `https://github.com/${owner}/${repo}/releases.atom`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/atom+xml' }
    })
    if (!res.ok) {
      debug.enabled && debug('GET %s returned %d', url, res.status)
      return undefined
    }
    return await res.text()
  } catch (err) {
    debug.enabled && debug('GET %s failed: %O', url, err)
    return undefined
  }
}

export async function parseReleasesFeed(
  xml: string
): Promise<GithubReleaseEntry[]> {
  const matches = xml.match(ENTRY_RE) || []
  // Convert each entry's HTML body to Markdown in parallel — the unified
  // pipeline is CPU-light per entry but feeds with 30+ releases were
  // serializing into a noticeable wait on slow boxes.
  const entries = await Promise.all(
    matches.map(async (raw): Promise<GithubReleaseEntry | undefined> => {
      const { tag, url, date, contentHtml } = parseEntry(raw)
      if (!tag || !url) return undefined
      const body = contentHtml ? await htmlToMarkdown(contentHtml) : ''
      return { tag, url, date, bodyMarkdown: body }
    })
  )
  return entries.filter((e): e is GithubReleaseEntry => e !== undefined)
}

// github.com/<owner>/<repo>/releases.atom emits a synthetic entry for every
// git tag, not just published Releases. A tag with no Release gets an
// auto-generated body of exactly "Release <tag>" (or none). Those carry no
// notes, so treat them as "not a real release" and let the caller fall back
// to a published CHANGELOG.md.
function isPublishedRelease(entry: GithubReleaseEntry): boolean {
  const body = entry.bodyMarkdown.trim()
  return body !== '' && body !== `Release ${entry.tag}`
}

export function renderReleasesAsChangelog(
  entries: GithubReleaseEntry[]
): string {
  if (entries.length === 0) return ''
  const lines: string[] = []
  for (const e of entries) {
    const datePart = e.date ? ` — ${e.date.substring(0, 10)}` : ''
    lines.push(`## [${e.tag}](${e.url})${datePart}`)
    lines.push('')
    if (e.bodyMarkdown.trim()) {
      lines.push(e.bodyMarkdown.trim())
      lines.push('')
    }
  }
  return lines.join('\n').trim()
}

export interface RepoSlug {
  owner: string
  repo: string
}

// Anchored on a real GitHub URL prefix (https/ssh/git protocol or
// `git@`) so a hostile or typo'd URL like `https://notgithub.com/...`
// doesn't get parsed as a github slug — without the anchor any string
// ending in `github.com/<owner>/<repo>` would match.
// Repo segment may contain dots (e.g. github.com/org/my.plugin); the
// trailing ".git" suffix is stripped explicitly. Single source of
// truth — raw-metrics.ts and detail.ts both consume parseGithubSlug.
const GITHUB_SLUG_RE =
  /^(?:(?:git\+)?https?:\/\/(?:www\.)?|ssh:\/\/git@|git@)?github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[?#/].*)?$/i

export function parseGithubSlug(url: string | undefined): RepoSlug | undefined {
  if (!url) return undefined
  const m = GITHUB_SLUG_RE.exec(url)
  if (!m) return undefined
  return { owner: m[1], repo: m[2] }
}

/**
 * Fetch and render a changelog from GitHub Releases for the given repo.
 * Returns Markdown when at least one real release was found and parsed,
 * otherwise undefined.
 *
 * Reads the public releases.atom feed rather than the /releases REST API on
 * purpose: the feed is served off github.com and does not draw down the 60/hr
 * unauthenticated REST budget. That budget is shared per source IP, so new
 * users and boats on Starlink (which recycles IPs aggressively) could exhaust
 * it before the App Store renders once. The cost is that the feed can't
 * distinguish a published Release from a bare tag, so isPublishedRelease
 * filters the placeholders out below.
 */
export async function fetchReleasesMarkdown(
  owner: string,
  repo: string
): Promise<string | undefined> {
  const xml = await fetchReleasesFeed(owner, repo)
  if (!xml) return undefined
  const entries = (await parseReleasesFeed(xml)).filter(isPublishedRelease)
  if (entries.length === 0) return undefined
  return renderReleasesAsChangelog(entries)
}
