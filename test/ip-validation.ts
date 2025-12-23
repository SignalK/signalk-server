import { strict as assert } from 'assert'
import {
  parseIPv4,
  parseIPv6,
  parseCIDR,
  normalizeIP,
  isIPInRange,
  isIPAllowed,
  extractClientIP,
  validateIPList
} from '../src/ip-validation'
import { Request } from 'express'

describe('IP Validation', () => {
  describe('parseIPv4', () => {
    it('parses valid IPv4 addresses', () => {
      assert.equal(parseIPv4('192.168.1.1'), 0xc0a80101n)
      assert.equal(parseIPv4('10.0.0.1'), 0x0a000001n)
      assert.equal(parseIPv4('0.0.0.0'), 0n)
      assert.equal(parseIPv4('255.255.255.255'), 0xffffffffn)
    })

    it('returns null for invalid IPv4 addresses', () => {
      assert.equal(parseIPv4('256.1.1.1'), null)
      assert.equal(parseIPv4('1.2.3'), null)
      assert.equal(parseIPv4('1.2.3.4.5'), null)
      assert.equal(parseIPv4('abc.def.ghi.jkl'), null)
      assert.equal(parseIPv4(''), null)
    })
  })

  describe('parseIPv6', () => {
    it('parses full IPv6 addresses', () => {
      assert.equal(
        parseIPv6('2001:0db8:0000:0000:0000:0000:0000:0001'),
        0x20010db8000000000000000000000001n
      )
    })

    it('parses compressed IPv6 addresses', () => {
      assert.equal(parseIPv6('::1'), 1n)
      assert.equal(parseIPv6('fe80::'), 0xfe800000000000000000000000000000n)
      assert.equal(
        parseIPv6('2001:db8::1'),
        0x20010db8000000000000000000000001n
      )
    })

    it('parses IPv4-mapped IPv6 addresses', () => {
      assert.equal(parseIPv6('::ffff:192.168.1.1'), 0xffffc0a80101n)
    })

    it('returns null for invalid IPv6 addresses', () => {
      assert.equal(parseIPv6('192.168.1.1'), null) // Pure IPv4
      assert.equal(parseIPv6('gggg::1'), null)
      assert.equal(parseIPv6(''), null)
    })
  })

  describe('parseCIDR', () => {
    it('parses IPv4 CIDR notation', () => {
      const result = parseCIDR('192.168.0.0/16')
      assert.notEqual(result, null)
      assert.equal(result!.isV6, false)
      assert.equal(result!.ip, 0xc0a80000n)
    })

    it('parses IPv6 CIDR notation', () => {
      const result = parseCIDR('fe80::/10')
      assert.notEqual(result, null)
      assert.equal(result!.isV6, true)
    })

    it('returns null for invalid CIDR', () => {
      assert.equal(parseCIDR('192.168.0.0'), null) // No prefix
      assert.equal(parseCIDR('192.168.0.0/33'), null) // Invalid prefix for IPv4
      assert.equal(parseCIDR('fe80::/129'), null) // Invalid prefix for IPv6
    })
  })

  describe('normalizeIP', () => {
    it('extracts IPv4 from IPv4-mapped IPv6', () => {
      assert.equal(normalizeIP('::ffff:192.168.1.1'), '192.168.1.1')
    })

    it('returns IPv4 unchanged', () => {
      assert.equal(normalizeIP('192.168.1.1'), '192.168.1.1')
    })

    it('returns IPv6 unchanged', () => {
      assert.equal(normalizeIP('fe80::1'), 'fe80::1')
    })
  })

  describe('isIPInRange', () => {
    it('matches IPv4 in CIDR range', () => {
      assert.equal(isIPInRange('192.168.1.1', '192.168.0.0/16'), true)
      assert.equal(isIPInRange('192.168.255.255', '192.168.0.0/16'), true)
      assert.equal(isIPInRange('192.169.0.1', '192.168.0.0/16'), false)
    })

    it('matches localhost', () => {
      assert.equal(isIPInRange('127.0.0.1', '127.0.0.0/8'), true)
      assert.equal(isIPInRange('127.255.255.255', '127.0.0.0/8'), true)
    })

    it('matches 10.x.x.x range', () => {
      assert.equal(isIPInRange('10.0.0.1', '10.0.0.0/8'), true)
      assert.equal(isIPInRange('10.255.255.255', '10.0.0.0/8'), true)
      assert.equal(isIPInRange('11.0.0.1', '10.0.0.0/8'), false)
    })

    it('matches 172.16.x.x range', () => {
      assert.equal(isIPInRange('172.16.0.1', '172.16.0.0/12'), true)
      assert.equal(isIPInRange('172.31.255.255', '172.16.0.0/12'), true)
      assert.equal(isIPInRange('172.32.0.1', '172.16.0.0/12'), false)
    })

    it('matches IPv6 in CIDR range', () => {
      assert.equal(isIPInRange('::1', '::1/128'), true)
      assert.equal(isIPInRange('fe80::1', 'fe80::/10'), true)
      assert.equal(isIPInRange('fc00::1', 'fc00::/7'), true)
    })

    it('matches single IP with /32', () => {
      assert.equal(isIPInRange('10.0.0.5', '10.0.0.5/32'), true)
      assert.equal(isIPInRange('10.0.0.6', '10.0.0.5/32'), false)
    })

    it('matches all with /0', () => {
      assert.equal(isIPInRange('1.2.3.4', '0.0.0.0/0'), true)
      assert.equal(isIPInRange('255.255.255.255', '0.0.0.0/0'), true)
    })
  })

  describe('isIPAllowed', () => {
    it('allows private IPs with default ranges', () => {
      assert.equal(isIPAllowed('127.0.0.1'), true)
      assert.equal(isIPAllowed('192.168.1.1'), true)
      assert.equal(isIPAllowed('10.0.0.1'), true)
      assert.equal(isIPAllowed('172.16.0.1'), true)
    })

    it('blocks public IPs with default ranges', () => {
      assert.equal(isIPAllowed('8.8.8.8'), false)
      assert.equal(isIPAllowed('1.1.1.1'), false)
      assert.equal(isIPAllowed('203.0.113.1'), false)
    })

    it('allows IPv6 loopback and link-local with defaults', () => {
      assert.equal(isIPAllowed('::1'), true)
      assert.equal(isIPAllowed('fe80::1'), true)
    })

    it('uses custom allow list when provided', () => {
      assert.equal(isIPAllowed('8.8.8.8', ['8.8.8.0/24']), true)
      assert.equal(isIPAllowed('8.8.4.4', ['8.8.8.0/24']), false)
    })

    it('allows all with 0.0.0.0/0', () => {
      assert.equal(isIPAllowed('1.2.3.4', ['0.0.0.0/0']), true)
      assert.equal(isIPAllowed('8.8.8.8', ['0.0.0.0/0']), true)
    })

    it('returns false for undefined IP', () => {
      assert.equal(isIPAllowed(undefined), false)
    })
  })

  describe('extractClientIP', () => {
    it('extracts IP from x-forwarded-for header', () => {
      const req = {
        headers: { 'x-forwarded-for': '203.0.113.50' },
        socket: { remoteAddress: '127.0.0.1' }
      } as unknown as Request
      assert.equal(extractClientIP(req), '203.0.113.50')
    })

    it('extracts first IP from x-forwarded-for with multiple IPs', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178'
        },
        socket: { remoteAddress: '127.0.0.1' }
      } as unknown as Request
      assert.equal(extractClientIP(req), '203.0.113.50')
    })

    it('falls back to socket address when no x-forwarded-for', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '192.168.1.100' }
      } as unknown as Request
      assert.equal(extractClientIP(req), '192.168.1.100')
    })

    it('normalizes IPv4-mapped IPv6 from socket', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.100' }
      } as unknown as Request
      assert.equal(extractClientIP(req), '192.168.1.100')
    })
  })

  describe('validateIPList', () => {
    it('returns empty array for valid IPs', () => {
      assert.deepEqual(
        validateIPList(['192.168.0.0/16', '10.0.0.0/8', '::1/128']),
        []
      )
    })

    it('returns errors for invalid CIDR', () => {
      const errors = validateIPList(['192.168.0.0/33'])
      assert.equal(errors.length, 1)
      assert.ok(errors[0].includes('Invalid CIDR'))
    })

    it('returns errors for invalid IP', () => {
      const errors = validateIPList(['not-an-ip'])
      assert.equal(errors.length, 1)
      assert.ok(errors[0].includes('Invalid IP'))
    })

    it('skips empty strings', () => {
      assert.deepEqual(validateIPList(['', '  ', '192.168.0.0/16']), [])
    })
  })
})
