/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Convert an npm package name into a filesystem-safe segment for use as
 * a cache file or directory name. The result is guaranteed to:
 * - contain no path separators (`/`, `\`)
 * - contain no path-traversal `..`
 * - contain no NUL bytes
 *
 * so a crafted name (e.g. `../etc/passwd`) cannot resolve a cache
 * file outside its intended directory when joined with `path.join`.
 * Both `/` and `\` are replaced with `__` (so `@signalk/foo` becomes
 * `@signalk__foo` on every platform); `..` is replaced with `__` so it
 * cannot survive as a path component; NUL bytes are stripped.
 */
export function safeName(pkg: string): string {
  return String(pkg ?? '')
    .replace(/\0/g, '')
    .replace(/[/\\]/g, '__')
    .replace(/\.\./g, '__')
}
