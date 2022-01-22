import coreDebug from 'debug'

const knownDebugs = new Set<string>()

export function createDebug(debugName: string) {
  knownDebugs.add(debugName)
  return coreDebug(debugName)
}

export function listKnownDebugs() {
  return Array.from(knownDebugs)
}
