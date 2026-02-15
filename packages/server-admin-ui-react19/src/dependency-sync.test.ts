import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { satisfies } from 'semver'

describe('dependency version sync', () => {
  it('installed versions satisfy @signalk/server-admin-ui-dependencies peerDependencies', () => {
    const depsPackageJson = JSON.parse(
      readFileSync(
        join(__dirname, '../../server-admin-ui-dependencies/package.json'),
        'utf-8'
      )
    )

    const peerDeps: Record<string, string> =
      depsPackageJson.peerDependencies ?? {}

    const mismatches: string[] = []

    for (const [name, range] of Object.entries(peerDeps)) {
      let installedVersion: string
      try {
        const pkgJson = JSON.parse(
          readFileSync(
            require.resolve(`${name}/package.json`, {
              paths: [join(__dirname, '..')]
            }),
            'utf-8'
          )
        )
        installedVersion = pkgJson.version
      } catch {
        mismatches.push(`${name}: not installed (expected ${range})`)
        continue
      }

      if (!satisfies(installedVersion, range)) {
        mismatches.push(
          `${name}: installed ${installedVersion} does not satisfy ${range}`
        )
      }
    }

    expect(
      mismatches,
      'Version mismatches with @signalk/server-admin-ui-dependencies'
    ).toEqual([])
  })
})
