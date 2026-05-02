/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { createDebug } from '../debug'

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

const htmlProcessor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
    emphasis: '_',
    strong: '*'
  })

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
    const file = await htmlProcessor.process(html)
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

// Repo segment may contain dots (e.g. github.com/org/my.plugin); the
// trailing ".git" suffix is stripped explicitly. Mirrors the regex in
// raw-metrics.ts.
const GITHUB_SLUG_RE =
  /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[?#/].*)?$/i

export function parseGithubSlug(url: string | undefined): RepoSlug | undefined {
  if (!url) return undefined
  const m = GITHUB_SLUG_RE.exec(url)
  if (!m) return undefined
  return { owner: m[1], repo: m[2] }
}

/**
 * Fetch and render a changelog from GitHub Releases for the given repo.
 * Returns Markdown when at least one release was found and parsed,
 * otherwise undefined. No GitHub token required — uses the public
 * releases.atom feed.
 */
export async function fetchReleasesMarkdown(
  owner: string,
  repo: string
): Promise<string | undefined> {
  const xml = await fetchReleasesFeed(owner, repo)
  if (!xml) return undefined
  const entries = await parseReleasesFeed(xml)
  if (entries.length === 0) return undefined
  return renderReleasesAsChangelog(entries)
}
