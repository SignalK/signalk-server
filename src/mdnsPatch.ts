import { createDebug } from './debug'

const debug = createDebug('signalk-server:mdns-patch')
const MEMBERSHIP_ERROR_PREFIX =
  'Fatal error: Could not add membership to interface '

type BindSocket = (this: unknown, ...args: unknown[]) => Promise<unknown>

type PatchedBindSocket = BindSocket & {
  __signalkPatched?: true
}

type NetworkInterfaceModule = {
  NetworkInterface?: {
    prototype?: {
      _bindSocket?: PatchedBindSocket
    }
  }
}

let patchApplied = false
let activeConsoleFilterCount = 0
let restoreConsoleError: (() => void) | undefined

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isIgnorableMembershipError(args: unknown[]): boolean {
  const [message, error] = args

  return (
    typeof message === 'string' &&
    message.startsWith(MEMBERSHIP_ERROR_PREFIX) &&
    isErrnoException(error) &&
    error.code === 'EADDRINUSE'
  )
}

function installConsoleFilter() {
  activeConsoleFilterCount += 1

  if (activeConsoleFilterCount > 1) {
    return
  }

  const originalConsoleError = console.error

  console.error = (...args: unknown[]) => {
    if (isIgnorableMembershipError(args)) {
      const address = (args[0] as string).slice(MEMBERSHIP_ERROR_PREFIX.length)
      debug.enabled &&
        debug(
          `Ignoring @astronautlabs/mdns addMembership EADDRINUSE on ${address}`
        )
      return
    }

    originalConsoleError(...args)
  }

  restoreConsoleError = () => {
    console.error = originalConsoleError
    restoreConsoleError = undefined
  }
}

function uninstallConsoleFilter() {
  if (activeConsoleFilterCount === 0) {
    return
  }

  activeConsoleFilterCount -= 1

  if (activeConsoleFilterCount === 0) {
    restoreConsoleError?.()
  }
}

export function patchAstronautLabsMdns() {
  if (patchApplied) {
    return
  }

  let networkInterfaceModule: NetworkInterfaceModule

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    networkInterfaceModule = require('@astronautlabs/mdns/dist/NetworkInterface')
  } catch (error) {
    debug.enabled &&
      debug(`Unable to patch @astronautlabs/mdns NetworkInterface: ${error}`)
    return
  }

  const prototype = networkInterfaceModule.NetworkInterface?.prototype
  const originalBindSocket = prototype?._bindSocket

  if (typeof originalBindSocket !== 'function') {
    debug.enabled &&
      debug('Unable to patch @astronautlabs/mdns NetworkInterface._bindSocket')
    return
  }

  if (originalBindSocket.__signalkPatched) {
    patchApplied = true
    return
  }

  const patchedBindSocket: PatchedBindSocket = function patchedBindSocket(
    this: unknown,
    ...args: unknown[]
  ) {
    installConsoleFilter()

    try {
      const result = originalBindSocket.apply(this, args)
      return result.finally(() => {
        uninstallConsoleFilter()
      })
    } catch (error) {
      uninstallConsoleFilter()
      throw error
    }
  }

  patchedBindSocket.__signalkPatched = true
  networkInterfaceModule.NetworkInterface!.prototype!._bindSocket =
    patchedBindSocket
  patchApplied = true
}
