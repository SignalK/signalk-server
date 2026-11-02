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

/**
 * Returns the README.md of the installed copy of `name` when that copy is
 * `version`, so the detail page needs no CDN round trip for a plugin the
 * user already runs. `moduleDirs` is searched in order and the first
 * directory holding the package wins, matching how the server resolves
 * installed modules. Any other version, or no README.md, yields undefined
 * so the caller falls back to the CDN for the version it is showing.
 */
export function readInstalledReadme(
  moduleDirs: string[],
  name: string,
  version: string
): string | undefined {
  for (const dir of moduleDirs) {
    const pkgDir = path.join(dir, name)
    let installedVersion: unknown
    try {
      installedVersion = JSON.parse(
        fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
      ).version
    } catch {
      continue
    }
    if (installedVersion !== version) return undefined
    try {
      return fs.readFileSync(path.join(pkgDir, 'README.md'), 'utf8')
    } catch {
      return undefined
    }
  }
  return undefined
}
