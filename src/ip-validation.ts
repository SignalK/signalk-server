import { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Default allowed IP ranges - private/local networks only.
 * Used when allowedSourceIPs is not configured.
 */
const DEFAULT_ALLOWED_IPS = [
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
 * Extract client IP from request.
 * Checks X-Forwarded-For header first, then falls back to socket address.
 */
export function extractClientIP(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for']
  if (xff) {
    const first = Array.isArray(xff) ? xff[0] : xff.split(',')[0]
    return normalizeIP(first.trim())
  }
  const socketAddr = req.socket?.remoteAddress
  return socketAddr ? normalizeIP(socketAddr) : undefined
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
 */
export function createIPFilterMiddleware(
  getConfig: () => { allowedSourceIPs?: string[] }
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = extractClientIP(req)
    const config = getConfig()

    if (!isIPAllowed(ip, config.allowedSourceIPs)) {
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
