/*
 * IP validation utilities for @signalk/streams
 *
 * These functions are used to validate source IP addresses for UDP connections.
 */

const ipaddr = require('ipaddr.js')

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

/**
 * Check if an IP address is within a CIDR range.
 */
function isIPInRange(ip, cidr) {
  try {
    const parsedCIDR = ipaddr.parseCIDR(cidr)
    const parsedIP = ipaddr.process(ip)

    // Handle type mismatch (IPv4 vs IPv6)
    if (parsedIP.kind() !== parsedCIDR[0].kind()) {
      // IPv4-mapped IPv6 handling
      if (parsedIP.kind() === 'ipv6') {
        if (parsedIP.isIPv4MappedAddress() && parsedCIDR[0].kind() === 'ipv4') {
          return parsedIP.toIPv4Address().match(parsedCIDR)
        }
      }
      return false
    }

    return parsedIP.match(parsedCIDR)
  } catch {
    return false
  }
}

/**
 * Check if an IP address is allowed based on a list of CIDR ranges.
 * If allowList is undefined or empty, uses default private network ranges.
 */
function isIPAllowed(ip, allowList) {
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

module.exports = {
  isIPAllowed,
  isIPInRange,
  DEFAULT_ALLOWED_IPS
}
