import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'

export interface BundledPackage {
  name: string
  /** node_modules directory that contains the package */
  location: string
}

// Package managers place the server's own dependencies differently: nested
// under appPath (source checkout, global npm install), hoisted beside it
// (local npm install) or linked as its siblings in a pnpm store. Node's lookup
// chain from appPath covers all of them. package.json is checked directly
// because many packages do not export it.
export function findPackageLocation(
  appPath: string,
  name: string
): string | undefined {
  const lookupPaths =
    createRequire(path.join(appPath, 'package.json')).resolve.paths(name) ?? []
  return lookupPaths.find((dir) =>
    fs.existsSync(path.join(dir, name, 'package.json'))
  )
}

export function findBundledPackages(appPath: string): BundledPackage[] {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(appPath, 'package.json'), 'utf8')
  )
  const names = Object.keys({
    ...pkg.dependencies,
    ...pkg.optionalDependencies
  })
  const result: BundledPackage[] = []
  for (const name of names) {
    const location = findPackageLocation(appPath, name)
    if (location) {
      result.push({ name, location })
    }
  }
  return result
}
