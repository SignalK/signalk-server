/*
 * Copyright 2026 Signal K
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'fs'
import path from 'path'
import { Config } from './config/config'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:diagnostics')

// Curated list of runtime dependencies whose drift matters to the boat operator.
// The downstream consumer (signalk-doctor-server) does not maintain its own
// copy — it trusts whatever this list returns, so the allow-list lives here.
export const TRACKED_PACKAGES = [
  '@canboat/canboatjs',
  '@canboat/ts-pgns',
  '@signalk/n2k-signalk',
  '@signalk/nmea0183-signalk',
  '@signalk/path-metadata',
  '@signalk/server-admin-ui',
  '@signalk/server-api',
  '@signalk/streams',
  'bonjour-service'
] as const

export interface InstalledPackage {
  name: string
  version: string
}

export interface Diagnostics {
  packages: InstalledPackage[]
}

export type DiagnosticsConfig = Pick<Config, 'appPath' | 'configPath'>

interface PackageJson {
  version?: unknown
}

function readVersionAt(pkgJsonPath: string): string | undefined {
  if (!fs.existsSync(pkgJsonPath)) {
    return undefined
  }
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as PackageJson
    if (typeof parsed.version === 'string') {
      return parsed.version
    }
  } catch (err) {
    debug.enabled &&
      debug(`failed reading ${pkgJsonPath}: ${(err as Error).message}`)
  }
  return undefined
}

// Resolve a package's version starting from `baseDir`, walking up the
// directory tree and checking `<ancestor>/node_modules/<pkg>/package.json`
// at each level — the same lookup Node's own resolver does. A flat check
// of only `baseDir/node_modules` misses dependencies npm has *hoisted*
// to an ancestor `node_modules`: in the production image signalk-server
// runs from `…/node_modules/signalk-server`, so `appPath` is that nested
// dir, but `@canboat/*` and `bonjour-service` are hoisted one level up to
// the outer `node_modules`. Without the walk they'd be silently dropped.
function findPackageVersion(
  baseDir: string,
  packageName: string
): string | undefined {
  let dir = path.resolve(baseDir)
  for (;;) {
    const version = readVersionAt(
      path.join(dir, 'node_modules', packageName, 'package.json')
    )
    if (version !== undefined) {
      return version
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

export function getDiagnostics(config: DiagnosticsConfig): Diagnostics {
  const { appPath, configPath } = config
  // configPath first so an operator's appstore-installed copy wins over a
  // version bundled in the app image; dedupe when they coincide.
  const baseDirs = appPath === configPath ? [appPath] : [configPath, appPath]

  const packages: InstalledPackage[] = []
  for (const name of TRACKED_PACKAGES) {
    let version: string | undefined
    for (const base of baseDirs) {
      version = findPackageVersion(base, name)
      if (version !== undefined) {
        break
      }
    }
    if (version !== undefined) {
      packages.push({ name, version })
    }
  }
  return { packages }
}
