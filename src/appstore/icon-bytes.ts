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

const debug = createDebug('signalk-server:appstore:icon-bytes')

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 1024 * 1024 // 1 MB hard cap per icon (typical icons are 5-100 KB)

// Only content types with an "image/" prefix are written to disk — this
// protects against a malicious plugin pointing signalk.appIcon at an HTML
// page or executable. SVG is accepted because <img src=".svg"> renders it
// safely without executing embedded scripts.
const ALLOWED_CONTENT_TYPES = /^image\//i

const EXTENSION_FOR_CT: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
}

export interface StoredIcon {
  path: string
  contentType: string
  size: number
  writtenAt: number
}

export interface IconBytesCache {
  storeRoot(): string
  /** Resolve a stored icon for the given plugin (latest version wins). */
  read(pkgName: string): StoredIcon | undefined
  /** Download and persist the icon bytes. Returns the stored record or null on failure. */
  download(
    pkgName: string,
    version: string,
    cdnUrl: string
  ): Promise<StoredIcon | null>
  /** Remove every cached icon byte. Used by /appstore/refresh. */
  invalidate(): void
}

function extForContentType(ct: string): string | undefined {
  const base = ct.split(';')[0].trim().toLowerCase()
  return EXTENSION_FOR_CT[base]
}

export function createIconBytesCache(cacheDir: string): IconBytesCache {
  const root = path.join(cacheDir, 'icon-bytes')

  function ensureRoot() {
    try {
      fs.mkdirSync(root, { recursive: true })
    } catch (err) {
      debug.enabled && debug('mkdir %s failed: %O', root, err)
    }
  }

  function purgeOldVersions(pkgName: string, keepVersion?: string) {
    // Drop the existsSync probe and readdir directly: avoids a TOCTOU
    // window where another process removes `root` between the two
    // calls. ENOENT just means there's nothing to purge.
    let entries: string[]
    try {
      entries = fs.readdirSync(root)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        debug.enabled && debug('purgeOldVersions %s failed: %O', pkgName, err)
      }
      return
    }
    const prefix = `${safeName(pkgName)}@`
    const keep = keepVersion ? `${prefix}${keepVersion}.` : undefined
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue
      if (keep && entry.startsWith(keep)) continue
      try {
        fs.unlinkSync(path.join(root, entry))
        debug.enabled && debug('purged stale icon %s', entry)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          debug.enabled && debug('purge %s failed: %O', entry, err)
        }
      }
    }
  }

  function findStored(pkgName: string): StoredIcon | undefined {
    if (!fs.existsSync(root)) return undefined
    const prefix = `${safeName(pkgName)}@`
    let best: { entry: string; mtime: number } | undefined
    try {
      for (const entry of fs.readdirSync(root)) {
        if (!entry.startsWith(prefix)) continue
        const full = path.join(root, entry)
        const stat = fs.statSync(full)
        if (!best || stat.mtimeMs > best.mtime) {
          best = { entry, mtime: stat.mtimeMs }
        }
      }
    } catch (err) {
      debug.enabled && debug('findStored %s failed: %O', pkgName, err)
      return undefined
    }
    if (!best) return undefined
    const full = path.join(root, best.entry)
    const ext = best.entry.split('.').pop() || ''
    const contentType = guessContentTypeFromExt(ext)
    // Re-stat for the size: a concurrent purgeOldVersions or a manual
    // /appstore/refresh between the loop and here could have removed
    // the file. Treat that as "not stored" rather than throwing.
    let size: number
    try {
      size = fs.statSync(full).size
    } catch (err) {
      debug.enabled && debug('findStored %s re-stat failed: %O', pkgName, err)
      return undefined
    }
    return {
      path: full,
      contentType,
      size,
      writtenAt: best.mtime
    }
  }

  async function downloadBytes(
    pkgName: string,
    version: string,
    cdnUrl: string
  ): Promise<StoredIcon | null> {
    let contentType: string
    let bytes: Uint8Array
    try {
      const res = await fetch(cdnUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
      if (!res.ok) {
        debug.enabled && debug('GET %s returned %d', cdnUrl, res.status)
        return null
      }
      contentType = res.headers.get('content-type') || ''
      if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
        debug.enabled &&
          debug('rejected %s: content-type %s not image/*', cdnUrl, contentType)
        return null
      }
      // Reject by Content-Length up front when the server sets it,
      // so a misconfigured or malicious URL advertising a 500 MB
      // payload doesn't tie up the download buffer at all.
      const declaredLength = Number(res.headers.get('content-length') || '0')
      if (declaredLength > MAX_BYTES) {
        debug.enabled &&
          debug(
            'rejected %s: declared size %d exceeds %d',
            cdnUrl,
            declaredLength,
            MAX_BYTES
          )
        return null
      }
      const ab = await res.arrayBuffer()
      if (ab.byteLength > MAX_BYTES) {
        debug.enabled &&
          debug(
            'rejected %s: size %d exceeds %d',
            cdnUrl,
            ab.byteLength,
            MAX_BYTES
          )
        return null
      }
      bytes = new Uint8Array(ab)
    } catch (err) {
      debug.enabled && debug('GET %s failed: %O', cdnUrl, err)
      return null
    }
    const ext = extForContentType(contentType)
    if (!ext) {
      debug.enabled &&
        debug('no extension mapping for content-type %s', contentType)
      return null
    }
    ensureRoot()
    const filename = `${safeName(pkgName)}@${version}.${ext}`
    const full = path.join(root, filename)
    try {
      fs.writeFileSync(full, bytes)
      purgeOldVersions(pkgName, version)
      return {
        path: full,
        contentType: contentType.split(';')[0].trim(),
        size: bytes.byteLength,
        writtenAt: Date.now()
      }
    } catch (err) {
      debug.enabled && debug('write %s failed: %O', full, err)
      return null
    }
  }

  return {
    storeRoot() {
      return root
    },
    read(pkgName) {
      return findStored(pkgName)
    },
    async download(pkgName, version, cdnUrl) {
      return downloadBytes(pkgName, version, cdnUrl)
    },
    invalidate() {
      try {
        if (fs.existsSync(root)) {
          fs.rmSync(root, { recursive: true, force: true })
        }
      } catch (err) {
        debug.enabled && debug('invalidate failed: %O', err)
      }
    }
  }
}

function guessContentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'svg':
      return 'image/svg+xml'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}
