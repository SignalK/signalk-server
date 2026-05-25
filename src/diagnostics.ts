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

function readPackageVersion(
  searchDirs: string[],
  packageName: string
): string | undefined {
  for (const dir of searchDirs) {
    const pkgPath = path.join(dir, packageName, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      continue
    }
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8')
      const parsed = JSON.parse(raw) as PackageJson
      if (typeof parsed.version === 'string') {
        return parsed.version
      }
    } catch (err) {
      debug.enabled &&
        debug(`failed reading ${pkgPath}: ${(err as Error).message}`)
    }
  }
  return undefined
}

export function getDiagnostics(config: DiagnosticsConfig): Diagnostics {
  const { appPath, configPath } = config
  const searchDirs = (
    appPath === configPath ? [appPath] : [configPath, appPath]
  ).map((p) => path.join(p, 'node_modules'))

  const packages: InstalledPackage[] = []
  for (const name of TRACKED_PACKAGES) {
    const version = readPackageVersion(searchDirs, name)
    if (version !== undefined) {
      packages.push({ name, version })
    }
  }
  return { packages }
}
