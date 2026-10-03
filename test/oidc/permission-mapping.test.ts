import { expect } from 'chai'

import {
  mapUserToPermission,
  matchIdentityList
} from '../../src/oidc/permission-mapping'
import type { OIDCConfig } from '../../src/oidc/types'

describe('OIDC Permission Mapping', () => {
  const baseConfig: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    redirectUri: 'https://signalk.local:3000/oidc/callback',
    scope: 'openid email profile groups',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'SSO Login',
    autoLogin: false
  }

  // Group mapping behavior predates identity allowlists; exercise it
  // through mapUserToPermission with a groups-only user
  const mapGroupsToPermission = (
    groups: string[] | undefined,
    config: OIDCConfig
  ) => mapUserToPermission({ sub: 'test-sub', groups }, config)

  describe('mapGroupsToPermission', () => {
    describe('with no group configuration', () => {
      it('should return defaultPermission when no groups configured', () => {
        const config: OIDCConfig = { ...baseConfig }
        const result = mapGroupsToPermission(['users', 'viewers'], config)
        expect(result).to.equal('readonly')
      })

      it('should return defaultPermission when user has no groups', () => {
        const config: OIDCConfig = { ...baseConfig }
        const result = mapGroupsToPermission([], config)
        expect(result).to.equal('readonly')
      })

      it('should return defaultPermission when user groups is undefined', () => {
        const config: OIDCConfig = { ...baseConfig }
        const result = mapGroupsToPermission(undefined, config)
        expect(result).to.equal('readonly')
      })
    })

    describe('with admin groups configured', () => {
      it('should return admin when user is in admin group', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins', 'sk-admin']
        }
        const result = mapGroupsToPermission(['users', 'admins'], config)
        expect(result).to.equal('admin')
      })

      it('should return admin when user is in any admin group', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins', 'sk-admin', 'superusers']
        }
        const result = mapGroupsToPermission(['sk-admin'], config)
        expect(result).to.equal('admin')
      })

      it('should return defaultPermission when user not in admin groups', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins']
        }
        const result = mapGroupsToPermission(['users', 'viewers'], config)
        expect(result).to.equal('readonly')
      })
    })

    describe('with readwrite groups configured', () => {
      it('should return readwrite when user is in readwrite group', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          readwriteGroups: ['users', 'editors']
        }
        const result = mapGroupsToPermission(['users'], config)
        expect(result).to.equal('readwrite')
      })

      it('should return readwrite when user is in any readwrite group', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          readwriteGroups: ['users', 'editors', 'operators']
        }
        const result = mapGroupsToPermission(['viewers', 'operators'], config)
        expect(result).to.equal('readwrite')
      })

      it('should return defaultPermission when user not in readwrite groups', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          readwriteGroups: ['editors']
        }
        const result = mapGroupsToPermission(['viewers'], config)
        expect(result).to.equal('readonly')
      })
    })

    describe('with both admin and readwrite groups configured', () => {
      const config: OIDCConfig = {
        ...baseConfig,
        adminGroups: ['admins', 'sk-admin'],
        readwriteGroups: ['users', 'operators']
      }

      it('should prioritize admin over readwrite', () => {
        const result = mapGroupsToPermission(['users', 'admins'], config)
        expect(result).to.equal('admin')
      })

      it('should return readwrite when in readwrite but not admin groups', () => {
        const result = mapGroupsToPermission(['users', 'viewers'], config)
        expect(result).to.equal('readwrite')
      })

      it('should return defaultPermission when in neither group', () => {
        const result = mapGroupsToPermission(['viewers', 'guests'], config)
        expect(result).to.equal('readonly')
      })
    })

    describe('with custom defaultPermission', () => {
      it('should use readwrite as default when configured', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          defaultPermission: 'readwrite'
        }
        const result = mapGroupsToPermission(['unknown-group'], config)
        expect(result).to.equal('readwrite')
      })

      it('should use admin as default when configured', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          defaultPermission: 'admin'
        }
        const result = mapGroupsToPermission([], config)
        expect(result).to.equal('admin')
      })
    })

    describe('case sensitivity', () => {
      it('should be case-sensitive by default', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['Admins']
        }
        const result = mapGroupsToPermission(['admins'], config)
        expect(result).to.equal('readonly')
      })

      it('should match exactly with correct case', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['Admins']
        }
        const result = mapGroupsToPermission(['Admins'], config)
        expect(result).to.equal('admin')
      })
    })

    describe('edge cases', () => {
      it('should handle empty admin groups array', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: [],
          readwriteGroups: ['users']
        }
        const result = mapGroupsToPermission(['users'], config)
        expect(result).to.equal('readwrite')
      })

      it('should handle empty readwrite groups array', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins'],
          readwriteGroups: []
        }
        const result = mapGroupsToPermission(['admins'], config)
        expect(result).to.equal('admin')
      })

      it('should handle groups with special characters', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['domain\\admins', 'org:admin-group']
        }
        const result = mapGroupsToPermission(['domain\\admins'], config)
        expect(result).to.equal('admin')
      })

      it('should handle whitespace in group names', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['Signal K Admins']
        }
        const result = mapGroupsToPermission(['Signal K Admins'], config)
        expect(result).to.equal('admin')
      })
    })
  })

  describe('identity allowlists', () => {
    const verifiedUser = {
      sub: 'user-123',
      email: 'owner@example.com',
      emailVerified: true
    }

    describe('with adminUsers configured', () => {
      const config: OIDCConfig = {
        ...baseConfig,
        adminUsers: ['owner@example.com']
      }

      it('should return admin for a listed, verified email', () => {
        expect(mapUserToPermission(verifiedUser, config)).to.equal('admin')
      })

      it('should NOT match when email_verified is false', () => {
        const user = { ...verifiedUser, emailVerified: false }
        expect(mapUserToPermission(user, config)).to.equal('readonly')
      })

      it('should NOT match when email_verified is absent', () => {
        const user = { sub: 'user-123', email: 'owner@example.com' }
        expect(mapUserToPermission(user, config)).to.equal('readonly')
      })

      it('should return defaultPermission for an unlisted email', () => {
        const user = { ...verifiedUser, email: 'other@example.com' }
        expect(mapUserToPermission(user, config)).to.equal('readonly')
      })

      it('should match email case-insensitively', () => {
        const user = { ...verifiedUser, email: 'Owner@Example.COM' }
        expect(mapUserToPermission(user, config)).to.equal('admin')
      })

      it('should match case-insensitively when the list is mixed case', () => {
        const mixedCaseConfig: OIDCConfig = {
          ...baseConfig,
          adminUsers: ['Owner@Example.com']
        }
        expect(mapUserToPermission(verifiedUser, mixedCaseConfig)).to.equal(
          'admin'
        )
      })

      it('should ignore surrounding whitespace in list entries', () => {
        const paddedConfig: OIDCConfig = {
          ...baseConfig,
          adminUsers: [' owner@example.com ']
        }
        expect(mapUserToPermission(verifiedUser, paddedConfig)).to.equal(
          'admin'
        )
      })
    })

    describe('with readwriteUsers configured', () => {
      const config: OIDCConfig = {
        ...baseConfig,
        adminUsers: ['owner@example.com'],
        readwriteUsers: ['crew@example.com']
      }

      it('should return readwrite for a listed, verified email', () => {
        const user = { ...verifiedUser, email: 'crew@example.com' }
        expect(mapUserToPermission(user, config)).to.equal('readwrite')
      })

      it('should prioritize adminUsers over readwriteUsers', () => {
        const bothConfig: OIDCConfig = {
          ...config,
          readwriteUsers: ['owner@example.com']
        }
        expect(mapUserToPermission(verifiedUser, bothConfig)).to.equal('admin')
      })
    })

    describe('precedence between groups and identity lists', () => {
      it('should let group mappings win over identity lists', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          readwriteGroups: ['crew'],
          adminUsers: ['owner@example.com']
        }
        const user = { ...verifiedUser, groups: ['crew'] }
        expect(mapUserToPermission(user, config)).to.equal('readwrite')
      })

      it('should fall through to identity lists when no group matches', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins'],
          adminUsers: ['owner@example.com']
        }
        const user = { ...verifiedUser, groups: ['viewers'] }
        expect(mapUserToPermission(user, config)).to.equal('admin')
      })
    })

    describe('with identityClaim preferred_username', () => {
      const config: OIDCConfig = {
        ...baseConfig,
        identityClaim: 'preferred_username',
        adminUsers: ['skipper']
      }

      it('should match preferred_username without requiring email_verified', () => {
        const user = { sub: 'user-123', preferredUsername: 'skipper' }
        expect(mapUserToPermission(user, config)).to.equal('admin')
      })

      it('should match preferred_username case-insensitively', () => {
        const user = { sub: 'user-123', preferredUsername: 'Skipper' }
        expect(mapUserToPermission(user, config)).to.equal('admin')
      })

      it('should NOT match against email when claim is preferred_username', () => {
        const user = {
          sub: 'user-123',
          email: 'skipper',
          emailVerified: true
        }
        expect(mapUserToPermission(user, config)).to.equal('readonly')
      })
    })

    describe('with identityClaim sub', () => {
      const config: OIDCConfig = {
        ...baseConfig,
        identityClaim: 'sub',
        adminUsers: ['User-123']
      }

      it('should match sub exactly', () => {
        expect(mapUserToPermission({ sub: 'User-123' }, config)).to.equal(
          'admin'
        )
      })

      it('should compare sub case-sensitively (opaque identifier)', () => {
        expect(mapUserToPermission({ sub: 'user-123' }, config)).to.equal(
          'readonly'
        )
      })
    })

    describe('matchIdentityList', () => {
      it('should return the matched permission', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminUsers: ['owner@example.com']
        }
        expect(matchIdentityList(verifiedUser, config)).to.equal('admin')
      })

      it('should return undefined when no list matches', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminUsers: ['other@example.com']
        }
        expect(matchIdentityList(verifiedUser, config)).to.equal(undefined)
      })

      it('should return undefined when no lists are configured', () => {
        expect(matchIdentityList(verifiedUser, baseConfig)).to.equal(undefined)
      })

      it('should ignore groups entirely', () => {
        const config: OIDCConfig = {
          ...baseConfig,
          adminGroups: ['admins']
        }
        const user = { ...verifiedUser, groups: ['admins'] }
        expect(matchIdentityList(user, config)).to.equal(undefined)
      })
    })
  })
})
