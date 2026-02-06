import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getSecurityConfig, WithSecurityStrategy } from '../../src/security'
import type { WithConfig } from '../../src/app'

type TestApp = {
  config: {
    configPath: string
    settings: Record<string, unknown>
  }
  securityStrategy: {
    configFromArguments?: boolean
    securityConfig?: Record<string, unknown>
  }
}

describe('security getSecurityConfig', () => {
  let tempDir: string
  let originalConsoleError: typeof console.error
  let consoleErrorCalled: boolean

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-security-'))
    originalConsoleError = console.error
    consoleErrorCalled = false
    console.error = () => {
      consoleErrorCalled = true
    }
  })

  afterEach(() => {
    console.error = originalConsoleError
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns empty config when security.json is missing', () => {
    const app = {
      config: {
        configPath: tempDir,
        settings: {}
      },
      securityStrategy: {}
    } as TestApp as unknown as WithConfig & WithSecurityStrategy

    const config = getSecurityConfig(app)
    expect(config).to.deep.equal({})
    expect(consoleErrorCalled).to.equal(false)
  })

  it('logs an error and returns empty config for invalid json', () => {
    const configPath = path.join(tempDir, 'security.json')
    fs.writeFileSync(configPath, '{not-json')

    const app = {
      config: {
        configPath: tempDir,
        settings: {}
      },
      securityStrategy: {}
    } as TestApp as unknown as WithConfig & WithSecurityStrategy

    const config = getSecurityConfig(app)
    expect(config).to.deep.equal({})
    expect(consoleErrorCalled).to.equal(true)
  })
})
