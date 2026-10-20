/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import semver from 'semver'

export const NODE_PLUGIN_KEYWORD = 'signalk-node-server-plugin'
export const WASM_PLUGIN_KEYWORD = 'signalk-wasm-plugin'

const PLUGIN_KEYWORDS: ReadonlySet<string> = new Set([
  NODE_PLUGIN_KEYWORD,
  WASM_PLUGIN_KEYWORD
])

interface SearchResult {
  package: { name: string; version: string }
}

export function isPluginPackage(keywords: string[] | undefined): boolean {
  return (keywords ?? []).some((k) => PLUGIN_KEYWORDS.has(k))
}

export function isWasmPackage(keywords: string[] | undefined): boolean {
  return (keywords ?? []).includes(WASM_PLUGIN_KEYWORD)
}

interface InstalledModule {
  keywords?: string[]
  type?: string
}

/**
 * Keywords to report for an installed module when the store falls back to
 * local data. The server loads any package with a wasmManifest as a WASM
 * plugin, even one published without the WASM keyword, so the module type
 * decides.
 */
export function installedModuleKeywords(
  installed: InstalledModule,
  fallbackKeyword: string
): string[] {
  const keywords = installed.keywords ?? [fallbackKeyword]
  if (installed.type === 'wasm' && !keywords.includes(WASM_PLUGIN_KEYWORD)) {
    return [...keywords, WASM_PLUGIN_KEYWORD]
  }
  return keywords
}

function isNewer(candidate: SearchResult, current: SearchResult): boolean {
  const next = semver.valid(candidate.package.version)
  const prev = semver.valid(current.package.version)
  if (!next) return false
  return !prev || semver.gt(next, prev)
}

/**
 * Combines the per-keyword npm search results into one plugin list. A
 * package published with both plugin keywords can come back from each
 * search at a different version while the npm index catches up, so the
 * newest one wins.
 */
export function mergePluginSearchResults<T extends SearchResult>(
  ...resultLists: T[][]
): T[] {
  const byName = new Map<string, T>()
  for (const results of resultLists) {
    for (const result of results) {
      const current = byName.get(result.package.name)
      if (!current || isNewer(result, current)) {
        byName.set(result.package.name, result)
      }
    }
  }
  return [...byName.values()]
}
