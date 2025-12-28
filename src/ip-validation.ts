import { Request, Response, NextFunction, RequestHandler } from 'express'
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

interface ParsedCIDR {
  ip: bigint
  mask: bigint
  isV6: boolean
}

/**
 * Parse an IPv4 address to a bigint.
 */
export function parseIPv4(ip: string): bigint | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  let result = 0n
  for (const part of parts) {
    const num = parseInt(part, 10)
    if (isNaN(num) || num < 0 || num > 255) return null
    result = (result << 8n) | BigInt(num)
  }
  return result
}

/**
 * Parse an IPv6 address to a bigint.
 * Handles full form, compressed (::), and IPv4-mapped addresses.
 */
export function parseIPv6(ip: string): bigint | null {
  // Handle IPv4-mapped IPv6 (::ffff:192.168.1.1)
  const v4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4MappedMatch) {
    const v4 = parseIPv4(v4MappedMatch[1])
    if (v4 === null) return null
    // Map to IPv6: ::ffff:x.x.x.x
    return 0xffff00000000n | v4
  }

  // Handle pure IPv4 passed to this function
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return null // Not an IPv6 address
  }

  let parts = ip.split(':')

  // Handle :: expansion
  const doubleColonIndex = ip.indexOf('::')
  if (doubleColonIndex !== -1) {
    const before = ip.slice(0, doubleColonIndex).split(':').filter(Boolean)
    const after = ip
      .slice(doubleColonIndex + 2)
      .split(':')
      .filter(Boolean)
    const missing = 8 - before.length - after.length
    if (missing < 0) return null
    parts = [...before, ...Array(missing).fill('0'), ...after]
  }

  if (parts.length !== 8) return null

  let result = 0n
  for (const part of parts) {
    if (part === '') {
      result = result << 16n
    } else {
      const num = parseInt(part, 16)
      if (isNaN(num) || num < 0 || num > 0xffff) return null
      result = (result << 16n) | BigInt(num)
    }
  }
  return result
}

/**
 * Parse a CIDR notation string (e.g., "192.168.0.0/16" or "fe80::/10").
 */
export function parseCIDR(cidr: string): ParsedCIDR | null {
  const parts = cidr.split('/')
  if (parts.length !== 2) return null

  const prefixLen = parseInt(parts[1], 10)
  if (isNaN(prefixLen) || prefixLen < 0) return null

  // Try IPv4 first
  const v4 = parseIPv4(parts[0])
  if (v4 !== null) {
    if (prefixLen > 32) return null
    const mask =
      prefixLen === 0 ? 0n : ((1n << 32n) - 1n) << BigInt(32 - prefixLen)
    return { ip: v4, mask, isV6: false }
  }

  // Try IPv6
  const v6 = parseIPv6(parts[0])
  if (v6 !== null) {
    if (prefixLen > 128) return null
    const mask =
      prefixLen === 0 ? 0n : ((1n << 128n) - 1n) << BigInt(128 - prefixLen)
    return { ip: v6, mask, isV6: true }
  }

  return null
}

/**
 * Normalize an IP address string.
 * Handles IPv4-mapped IPv6 addresses by extracting the IPv4 part.
 */
export function normalizeIP(ip: string): string {
  // Handle IPv4-mapped IPv6 (::ffff:192.168.1.1)
  const v4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4MappedMatch) {
    return v4MappedMatch[1]
  }
  return ip
}

/**
 * Check if an IP address is within a CIDR range.
 */
export function isIPInRange(ip: string, cidr: string): boolean {
  const parsed = parseCIDR(cidr)
  if (!parsed) return false

  const normalizedIP = normalizeIP(ip)

  if (parsed.isV6) {
    // Try parsing as IPv6
    let ipValue = parseIPv6(normalizedIP)
    if (ipValue === null) {
      // Maybe it's an IPv4 that should match IPv4-mapped IPv6
      const v4 = parseIPv4(normalizedIP)
      if (v4 !== null) {
        // Convert to IPv4-mapped IPv6 for comparison
        ipValue = 0xffff00000000n | v4
      } else {
        return false
      }
    }
    return (ipValue & parsed.mask) === (parsed.ip & parsed.mask)
  } else {
    // IPv4 CIDR
    const ipValue = parseIPv4(normalizedIP)
    if (ipValue === null) return false
    return (ipValue & parsed.mask) === (parsed.ip & parsed.mask)
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
      if (!parseCIDR(trimmed)) {
        errors.push(`Invalid CIDR: ${trimmed}`)
      }
    } else {
      // Single IP
      if (parseIPv4(trimmed) === null && parseIPv6(trimmed) === null) {
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
