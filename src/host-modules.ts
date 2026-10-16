/*
 * Host-provided modules
 *
 * Plugins installed in the server's data directory resolve their
 * dependencies from <configPath>/node_modules, never from the server's own
 * tree. For core interface packages this is harmful: dual copies break
 * object identity between plugin and server code, and one plugin's tight
 * version pin holds the hoisted copy back for every other plugin that would
 * accept a newer version (npm optimizes for dedupe, not freshness).
 *
 * This module hooks Node's CJS module resolution so that require() of the
 * packages listed below — including exported subpaths such as
 * '@signalk/server-api/history' — always resolves to the server's own copy,
 * no matter what npm installed in the plugin tree: the same model as
 * require('vscode') in VS Code extensions. Plugin-bundled copies remain on
 * disk but are never loaded.
 *
 * This module MUST be imported before any other module that may load one of
 * the host-provided packages.
 */

import Module from 'module'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:host-modules')

const HOST_PROVIDED_MODULES = ['baconjs', '@signalk/server-api']

const hostModulePaths = new Map<string, string | null>(
  HOST_PROVIDED_MODULES.map((name) => [name, require.resolve(name)])
)

function isHostProvided(request: string): boolean {
  return HOST_PROVIDED_MODULES.some(
    (name) => request === name || request.startsWith(name + '/')
  )
}

function resolveHostPath(request: string): string | null {
  let hostPath = hostModulePaths.get(request)
  if (hostPath === undefined) {
    try {
      // resolve from this module's context via the original resolver:
      // require.resolve() would re-enter the hook and recurse
      hostPath = origResolveFilename.call(Module, request, module, false)
    } catch {
      // subpath not exported by the host copy: leave resolution alone, so
      // requires that only work against a bundled copy keep working
      hostPath = null
    }
    hostModulePaths.set(request, hostPath)
  }
  return hostPath
}

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: Record<string, unknown>
) => string

const ModuleInternal = Module as unknown as Record<string, unknown>

const origResolveFilename = ModuleInternal._resolveFilename as ResolveFilename
ModuleInternal._resolveFilename = function (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: Record<string, unknown>
) {
  if (isHostProvided(request)) {
    const hostPath = resolveHostPath(request)
    if (hostPath !== null) {
      debug.enabled &&
        debug(`resolving ${request} for ${parent?.filename} to the host copy`)
      return hostPath
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options)
}
