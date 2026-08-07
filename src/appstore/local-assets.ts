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

export interface LocalAssetUrls {
  appIcon?: string
  screenshots?: string[]
}

interface SignalKAssetDeclaration {
  appIcon?: unknown
  screenshots?: unknown
}

interface PackageWithSignalK {
  signalk?: SignalKAssetDeclaration
}

/**
 * The webapp mount in webapps serves `<plugin>/public/` when a `public/`
 * directory exists, falling back to the package root otherwise. A
 * declared path like `./docs/screenshots/foo.png` is therefore
 * unreachable when the plugin ships a `public/` webapp — the `docs/`
 * tree sits outside the mount. Return the on-disk directory the mount
 * actually serves from, so candidate paths can be stat'd against it
 * before any URL is emitted.
 *
 * `packageLocation` is the installed module's parent directory (the
 * value carried on the plugin/webapp record); `undefined` means the
 * package is not installed locally and no served root exists.
 */
export function getInstalledServedRoot(
  pkgName: string,
  packageLocation: string | undefined
): string | undefined {
  if (!packageLocation) return undefined
  const base = path.join(packageLocation, pkgName)
  const publicDir = path.join(base, 'public')
  // Must be a directory: the webapps mount tests `<pkg>/public/` with a
  // trailing slash, which a regular file named `public` fails. Matching
  // on existence alone would pick a served root the mount never uses and
  // drop every asset that does resolve.
  return isDirectory(publicDir) ? publicDir : base
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

/**
 * Whether a declared asset path stays inside the plugin's own mount.
 *
 * A path escapes when it is server-absolute, or when any segment is
 * `..`. Both the raw and the percent-decoded form are checked: the raw
 * form is what gets joined against `servedRoot` on disk, while the
 * decoded form is what a static file server resolves for the browser.
 *
 * Backslashes are rejected outright. `path.join` treats `..\` as
 * traversal on Windows, so a declared `"..\secret"` would otherwise stat
 * a file outside the served root during the existence check.
 */
function isContainedRelativePath(cleaned: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(cleaned)
  } catch {
    // Malformed percent-encoding cannot be reasoned about; treat as unsafe.
    return false
  }
  for (const candidate of [cleaned, decoded]) {
    if (candidate.startsWith('/')) return false
    if (candidate.includes('\\')) return false
    if (candidate.split('/').includes('..')) return false
  }
  return true
}

/**
 * Turn a package.json-declared asset path into a URL under the plugin's
 * own `/<pkgName>/` mount.
 *
 * Webapps and plugins that ship static assets are mounted by the server
 * at `/<package-name>/`, so declared paths that look wrong against
 * unpkg's raw tarball layout (e.g. freeboard-sk's
 * `"./assets/icons/icon-72x72.png"`, actually at
 * `"/public/assets/icons/icon-72x72.png"` inside the tarball) resolve
 * correctly against the mounted serving root. Installed plugins reuse
 * that URL scheme so the App Store card matches what Webapps shows
 * elsewhere in the admin UI.
 *
 * Absolute (`http://`, `//`) and `data:` paths pass through untouched.
 *
 * `declaredPath` comes from a plugin's own package.json, so a hostile or
 * buggy plugin could otherwise ask the admin UI to load `/admin` or
 * `/plugins/somethingelse/...` by setting `signalk.appIcon` to
 * `"../foo.png"` or `"/admin"`. Anything that does not sit cleanly under
 * the plugin's own mount is dropped — see `isContainedRelativePath`.
 *
 * When `servedRoot` is known, paths whose target file is absent are
 * dropped too: the mount would 404 them anyway, and falling back to the
 * CDN URL beats shipping a broken `<img>`.
 */
export function buildLocalAssetUrl(
  pkgName: string,
  declaredPath: unknown,
  servedRoot: string | undefined
): string | undefined {
  if (!declaredPath || typeof declaredPath !== 'string') return undefined
  if (/^(https?:)?\/\//i.test(declaredPath)) return declaredPath
  if (/^data:/i.test(declaredPath)) return declaredPath
  const cleaned = declaredPath.replace(/^\.\//, '')
  if (!isContainedRelativePath(cleaned)) return undefined
  if (servedRoot) {
    const onDisk = path.join(servedRoot, cleaned)
    if (!fs.existsSync(onDisk)) return undefined
  }
  return `/${pkgName}/${cleaned}`
}

/**
 * Build the local `appIcon` / `screenshots` URLs declared by an
 * installed package, or `undefined` when the package declares neither
 * usable asset.
 */
export function buildLocalAssetUrls(
  pkgName: string,
  pkg: PackageWithSignalK | undefined,
  packageLocation: string | undefined
): LocalAssetUrls | undefined {
  const signalk = pkg?.signalk
  if (!signalk || typeof signalk !== 'object') return undefined
  const servedRoot = getInstalledServedRoot(pkgName, packageLocation)
  const appIcon =
    typeof signalk.appIcon === 'string' && signalk.appIcon.trim()
      ? buildLocalAssetUrl(pkgName, signalk.appIcon.trim(), servedRoot)
      : undefined
  let screenshots: string[] | undefined
  if (Array.isArray(signalk.screenshots)) {
    screenshots = signalk.screenshots
      .filter((s): s is string => typeof s === 'string' && !!s.trim())
      .map((s) => buildLocalAssetUrl(pkgName, s.trim(), servedRoot))
      .filter((s): s is string => !!s)
  }
  if (!appIcon && (!screenshots || screenshots.length === 0)) return undefined
  return { appIcon, screenshots }
}

export function packageNameIs<T extends { package: { name: string } }>(
  name: string
): (x: T) => boolean {
  return (x) => x.package.name === name
}
