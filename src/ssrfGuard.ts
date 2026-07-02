/*
 * Copyright 2026 Signal K project contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BlockList, isIP, LookupFunction } from 'node:net'
import dns from 'node:dns'

// Special-use destinations that the remote-connection endpoints must never
// reach. These are not valid Signal K peers and are the SSRF targets of value:
// the cloud metadata service (169.254.169.254), loopback-bound services, and
// other non-routable ranges. Private LAN ranges (RFC1918 / IPv6 ULA) are
// deliberately NOT blocked: connecting to another Signal K server on the boat's
// own network is the legitimate purpose of these endpoints.
const blockedRanges = new BlockList()
blockedRanges.addSubnet('0.0.0.0', 8, 'ipv4') // "this host" / this-network
blockedRanges.addSubnet('127.0.0.0', 8, 'ipv4') // loopback
blockedRanges.addSubnet('169.254.0.0', 16, 'ipv4') // link-local incl. cloud metadata
blockedRanges.addSubnet('224.0.0.0', 4, 'ipv4') // multicast
blockedRanges.addSubnet('240.0.0.0', 4, 'ipv4') // reserved + broadcast
blockedRanges.addAddress('::', 'ipv6') // unspecified
blockedRanges.addAddress('::1', 'ipv6') // loopback
blockedRanges.addSubnet('::', 96, 'ipv6') // deprecated IPv4-compatible (::a.b.c.d)
blockedRanges.addSubnet('64:ff9b::', 96, 'ipv6') // NAT64 well-known prefix (RFC 6052) - reaches embedded IPv4 in NAT64 networks
blockedRanges.addSubnet('fe80::', 10, 'ipv6') // link-local
blockedRanges.addSubnet('ff00::', 8, 'ipv6') // multicast

export class BlockedHostError extends Error {
  constructor(host: string) {
    super(`Connection to ${host} is not allowed`)
    this.name = 'BlockedHostError'
  }
}

// Classifies an IP literal as a blocked special-use address. IPv4-mapped IPv6
// forms (e.g. ::ffff:169.254.169.254) are normalised onto the IPv4 ranges by
// BlockList.check, closing that bypass vector.
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) {
    return false
  }
  return blockedRanges.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

// Throws if host is a literal IP in a blocked range. Hostnames pass through here
// and are validated later by ssrfSafeLookup once resolved. This synchronous
// check is required because Node skips the lookup option when the host is
// already an IP literal and connects to it directly.
export function assertAllowedHost(host: string): void {
  if (isBlockedAddress(host)) {
    throw new BlockedHostError(host)
  }
}

// A drop-in replacement for the dns.lookup used by http(s).request. It resolves
// the host, rejects the connection if any resolved address is a blocked
// special-use destination, and hands the validated address back to the socket.
// Validating here (rather than before the request) means the connection is
// pinned to an address we checked, so a hostname cannot resolve to a safe
// address during validation and a blocked one at connect time (DNS rebinding).
export const ssrfSafeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0)
      return
    }
    for (const { address, family } of addresses) {
      if (isBlockedAddress(address)) {
        callback(new BlockedHostError(hostname), address, family)
        return
      }
    }
    if ((options as dns.LookupAllOptions).all) {
      ;(callback as (e: Error | null, a: dns.LookupAddress[]) => void)(
        null,
        addresses
      )
    } else {
      callback(null, addresses[0].address, addresses[0].family)
    }
  })
}
