/*
 * BaconJS backward-compatibility shim
 *
 * The server uses BaconJS 3.x which has breaking API changes from 1.x/0.7.x.
 * Plugins may bundle their own older BaconJS, causing version mismatches when
 * they operate on Bacon.Bus objects from the server's StreamBundle.
 *
 * The critical incompatibility: BaconJS 3.x Event objects use boolean
 * properties (event.isEnd), while 1.x uses methods (event.isEnd()). When a
 * plugin's 1.x code subscribes to a server 3.x Bus, it receives 3.x Events
 * and crashes with "TypeError: e.isEnd is not a function".
 *
 * This module solves the problem by:
 * 1. Hooking Node's module resolution so ALL require('baconjs') calls in the
 *    process return the server's 3.x version — eliminating version mismatches
 * 2. Patching 3.x to restore the .map('.property') string shorthand that
 *    existed in 1.x (used by plugins like signalk-to-nmea2000)
 *
 * This module MUST be imported before any other module that uses BaconJS.
 */

import Module from 'module'
import * as Bacon from 'baconjs'

const serverBaconPath = require.resolve('baconjs')

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options: Record<string, unknown>
) => string

const ModuleInternal = Module as unknown as Record<string, unknown>

const origResolveFilename = ModuleInternal._resolveFilename as ResolveFilename
ModuleInternal._resolveFilename = function (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options: Record<string, unknown>
) {
  if (request === 'baconjs') {
    return serverBaconPath
  }
  return origResolveFilename.call(this, request, parent, isMain, options)
}

type Mappable = { map: (f: unknown) => unknown }

function patchMapShorthand(proto: Mappable) {
  const origMap = proto.map
  proto.map = function (this: Mappable, f: unknown) {
    if (typeof f === 'string' && f.startsWith('.')) {
      const prop = f.substring(1)
      return origMap.call(
        this,
        (v: Record<string, unknown> | null | undefined) =>
          v !== null && v !== undefined ? v[prop] : undefined
      )
    }
    return origMap.call(this, f)
  }
}

patchMapShorthand(Bacon.EventStream.prototype)
patchMapShorthand(Bacon.Property.prototype)
