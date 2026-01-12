import { expect } from 'chai'

import { mapGroupsToPermission } from '../../src/oidc/permission-mapping'
import type { OIDCConfig } from '../../src/oidc/types'

describe('OIDC Permission Mapping', () => {
  const baseConfig: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    scope: 'openid email profile groups',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'SSO Login',
    autoLogin: false
  }

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
})
