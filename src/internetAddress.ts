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

import { BlockList, isIP } from 'node:net'

// Addresses a request can come from without crossing the internet: this
// host, the boat's LAN, and the shared address space VPNs such as Tailscale
// hand out.
const localRanges = new BlockList()
localRanges.addSubnet('0.0.0.0', 8, 'ipv4')
localRanges.addSubnet('10.0.0.0', 8, 'ipv4')
localRanges.addSubnet('100.64.0.0', 10, 'ipv4')
localRanges.addSubnet('127.0.0.0', 8, 'ipv4')
localRanges.addSubnet('169.254.0.0', 16, 'ipv4')
localRanges.addSubnet('172.16.0.0', 12, 'ipv4')
localRanges.addSubnet('192.168.0.0', 16, 'ipv4')
localRanges.addAddress('::', 'ipv6')
localRanges.addAddress('::1', 'ipv6')
localRanges.addSubnet('fc00::', 7, 'ipv6')
localRanges.addSubnet('fe80::', 10, 'ipv6')

// IPv4-mapped IPv6 forms (::ffff:a.b.c.d) are checked against the IPv4
// ranges by BlockList.check.
export function isInternetAddress(address: string | undefined): boolean {
  if (address === undefined) {
    return false
  }
  const family = isIP(address)
  if (family === 0) {
    return false
  }
  return !localRanges.check(address, family === 4 ? 'ipv4' : 'ipv6')
}
