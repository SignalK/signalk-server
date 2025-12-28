import { Request, Response, NextFunction, RequestHandler } from 'express'
import * as ipaddr from 'ipaddr.js'
import { createDebug } from './debug'

const debug = createDebug('signalk-server:ip-validation')

/**
 * Default allowed IP ranges - private/local networks only.
 * Used when allowedSourceIPs is not configured.
 * Exported for use in Admin UI prefill and setup wizard.
 */
export const DEFAULT_ALLOWED_IPS = [
  '127.0.0.0/8', // IPv4 loopback
  '10.0.0.0/8', // RFC1918 Class A private
  '172.16.0.0/12', // RFC1918 Class B private
  '192.168.0.0/16', // RFC1918 Class C private
  '169.254.0.0/16', // Link-local
  '::1/128', // IPv6 loopback
  'fc00::/7', // IPv6 unique local (ULA)
  'fe80::/10' // IPv6 link-local
]

/**
 * Normalize an IP address string.
 * Handles IPv4-mapped IPv6 addresses by extracting the IPv4 part.
 */
export function normalizeIP(ip: string): string {
  try {
    // ipaddr.process() parses and converts IPv4-mapped IPv6 to IPv4
    return ipaddr.process(ip).toString()
  } catch {
    return ip
  }
}

/**
 * Check if an IP address is within a CIDR range.
 */
export function isIPInRange(ip: string, cidr: string): boolean {
  try {
    const parsedCIDR = ipaddr.parseCIDR(cidr)
    const parsedIP = ipaddr.process(ip)

    // Handle type mismatch (IPv4 vs IPv6)
    if (parsedIP.kind() !== parsedCIDR[0].kind()) {
      // IPv4-mapped IPv6 handling
      if (parsedIP.kind() === 'ipv6') {
        const ipv6 = parsedIP as ipaddr.IPv6
        if (ipv6.isIPv4MappedAddress() && parsedCIDR[0].kind() === 'ipv4') {
          return ipv6.toIPv4Address().match(parsedCIDR as [ipaddr.IPv4, number])
        }
      }
      return false
    }

    // Same kind - use tuple overload to avoid TypeScript union issue
    if (parsedIP.kind() === 'ipv4') {
      return (parsedIP as ipaddr.IPv4).match(
        parsedCIDR as [ipaddr.IPv4, number]
      )
    } else {
      return (parsedIP as ipaddr.IPv6).match(
        parsedCIDR as [ipaddr.IPv6, number]
      )
    }
  } catch {
    return false
  }
}

/**
 * Check if an IP address is allowed based on a list of CIDR ranges.
 * If allowList is undefined or empty, uses default private network ranges.
 */
export function isIPAllowed(
  ip: string | undefined,
  allowList?: string[]
): boolean {
  if (!ip) return false

  const ranges =
    allowList && allowList.length > 0 ? allowList : DEFAULT_ALLOWED_IPS

  for (const range of ranges) {
    if (isIPInRange(ip, range)) {
      return true
    }
  }
  return false
}

/**
 * Extract client IP from a WebSocket/Primus request, respecting trustProxy setting.
 * Unlike Express's req.ip, Primus doesn't automatically handle trust proxy,
 * so we must manually check the trustProxy setting.
 *
 * @param headers - The request headers object
 * @param socketAddress - The socket's remote address
 * @param trustProxy - The Express app's trustProxy setting (app.get('trust proxy'))
 */
export function extractClientIP(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
  trustProxy?: boolean | string | number
): string | undefined {
  const socketIP = socketAddress ? normalizeIP(socketAddress) : undefined

  // If trustProxy is not configured or falsy, always use socket address
  if (!trustProxy) {
    return socketIP
  }

  const xff = headers['x-forwarded-for']
  if (!xff) {
    return socketIP
  }

  // Parse X-Forwarded-For header
  const xffValue = Array.isArray(xff) ? xff[0] : xff
  const forwardedIPs = xffValue.split(',').map((ip) => ip.trim())

  if (forwardedIPs.length === 0) {
    return socketIP
  }

  // Handle different trustProxy values
  if (trustProxy === true) {
    // Trust all proxies - use leftmost (original client) IP
    return normalizeIP(forwardedIPs[0])
  }

  if (typeof trustProxy === 'number') {
    // Trust N proxies - skip N IPs from the right
    const index = Math.max(0, forwardedIPs.length - trustProxy)
    return normalizeIP(forwardedIPs[index])
  }

  if (typeof trustProxy === 'string') {
    // Trust specific IP/subnet - check if socket IP matches
    // For loopback, linklocal, uniquelocal, or specific IPs
    const trustedRanges: Record<string, string[]> = {
      loopback: ['127.0.0.0/8', '::1/128'],
      linklocal: ['169.254.0.0/16', 'fe80::/10'],
      uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7']
    }

    const rangesToCheck = trustedRanges[trustProxy] || [trustProxy]
    const isTrusted = socketIP
      ? rangesToCheck.some((range) => {
          // Handle both single IPs and CIDR notation
          const cidr = range.includes('/') ? range : `${range}/32`
          return isIPInRange(socketIP, cidr)
        })
      : false

    if (isTrusted) {
      return normalizeIP(forwardedIPs[0])
    }
  }

  // Default to socket address if trust conditions not met
  return socketIP
}

/**
 * Validate a list of IP addresses/CIDR ranges.
 * Returns an array of error messages (empty if all valid).
 */
export function validateIPList(ips: string[]): string[] {
  const errors: string[] = []
  for (const ip of ips) {
    const trimmed = ip.trim()
    if (!trimmed) continue

    if (trimmed.includes('/')) {
      // CIDR notation
      try {
        ipaddr.parseCIDR(trimmed)
      } catch {
        errors.push(`Invalid CIDR: ${trimmed}`)
      }
    } else {
      // Single IP
      if (!ipaddr.isValid(trimmed)) {
        errors.push(`Invalid IP: ${trimmed}`)
      }
    }
  }
  return errors
}

/**
 * Create Express middleware that filters requests by source IP.
 * Uses req.ip which respects Express's trustProxy setting.
 */
export function createIPFilterMiddleware(
  getAllowedIPs: () => string[] | undefined
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use req.ip which respects Express's trustProxy setting
    // This ensures X-Forwarded-For is only trusted when trustProxy is configured
    const ip = req.ip ? normalizeIP(req.ip) : undefined

    if (!isIPAllowed(ip, getAllowedIPs())) {
      debug('Blocked request from %s to %s %s', ip, req.method, req.path)
      res.status(403).json({
        state: 'DENIED',
        statusCode: 403,
        message: 'Request not allowed from this IP address'
      })
      return
    }
    next()
  }
}

/**
 * Check if an IP address is a public (non-private) IP.
 * Returns true if the IP is NOT in any of the default private ranges.
 */
export function isPublicIP(ip: string): boolean {
  if (!ip) return false
  const normalizedIP = normalizeIP(ip)

  // Check against all default private ranges
  for (const privateRange of DEFAULT_ALLOWED_IPS) {
    if (isIPInRange(normalizedIP, privateRange)) {
      return false
    }
  }
  return true
}
