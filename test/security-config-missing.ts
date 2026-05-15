import { expect } from 'chai'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSecurityConfig } = require('../dist/security.js')

describe('getSecurityConfig', () => {
  describe('missing security.json', () => {
    let configPath: string
    let restoreConsoleError: () => void
    let loggedErrors: unknown[][]

    beforeEach(() => {
      configPath = mkdtempSync(join(tmpdir(), 'sk-security-config-'))
      loggedErrors = []
      const originalError = console.error
      console.error = (...args: unknown[]) => loggedErrors.push(args)
      restoreConsoleError = () => {
        console.error = originalError
      }
    })

    afterEach(() => {
      restoreConsoleError()
    })

    it('returns {} and does not log when securityStrategy is not initialized', () => {
      // Reproduces startup ordering in src/index.ts: setupCors() reads the
      // security config before startSecurity() installs the dummy strategy.
      const app = {
        config: { configPath },
        securityStrategy: undefined
      }

      const result = getSecurityConfig(app)

      expect(result).to.deep.equal({})
      expect(loggedErrors).to.be.empty
    })

    it('returns {} and does not log when security is disabled (dummy strategy)', () => {
      const app = {
        config: { configPath },
        securityStrategy: { isDummy: () => true }
      }

      const result = getSecurityConfig(app)

      expect(result).to.deep.equal({})
      expect(loggedErrors).to.be.empty
    })

    it('logs an error when security is enabled and the file is missing', () => {
      const app = {
        config: { configPath },
        securityStrategy: { isDummy: () => false }
      }

      getSecurityConfig(app)

      expect(loggedErrors).to.have.length(1)
    })
  })
})
