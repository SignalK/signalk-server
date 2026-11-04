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

export interface StorePackageEntry {
  package: { name: string; version: string }
  /** Set on an installed entry the npm search did not return. */
  installedVersion?: string
}

/**
 * Offers npm's latest release for installed entries the search did not
 * return, which otherwise carry only their installed version. The installed
 * version is the base every time, so applying older dist-tags after newer
 * ones cannot leave a version npm no longer reports as latest.
 */
export function withPublishedVersions<T extends StorePackageEntry>(
  entries: T[],
  distTags: Record<string, { latest?: string } | undefined>
): T[] {
  return entries.map((entry) => {
    const installed = entry.installedVersion
    if (installed === undefined) return entry
    const latest = distTags[entry.package.name]?.latest
    const version =
      latest !== undefined &&
      semver.valid(latest) &&
      semver.valid(installed) &&
      semver.gt(latest, installed)
        ? latest
        : installed
    if (version === entry.package.version) return entry
    return { ...entry, package: { ...entry.package, version } }
  })
}
