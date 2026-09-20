/*
 * Tests for OIDC admin route handling of environment variable values.
 *
 * settings-api.test.ts covers the GET/PUT contract over a running server, but
 * it cannot see what a save writes to security.json, which is exactly what
 * matters for a secret that is meant to stay in the environment. These tests
 * register the routes on a bare Express app so the saved configuration can be
 * inspected directly.
 */

import { expect } from 'chai'
import express from 'express'
import type { AddressInfo } from 'node:net'
import {
  registerOIDCAdminRoutes,
  SecurityConfigForOIDC
} from '../../src/oidc/oidc-admin'

const OIDC_ROUTE = '/skServer/security/oidc'

const ENV_SECRET = 'secret-from-env'
const ENV_REDIRECT_URI =
  'https://boat.example.com/signalk/v1/auth/oidc/callback'
const FORM_REDIRECT_URI =
  'https://gui.example.com/signalk/v1/auth/oidc/callback'

const OIDC_ENV_VARS = [
  'SIGNALK_OIDC_ENABLED',
  'SIGNALK_OIDC_ISSUER',
  'SIGNALK_OIDC_CLIENT_ID',
  'SIGNALK_OIDC_CLIENT_SECRET',
  'SIGNALK_OIDC_REDIRECT_URI'
]

function formBody(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    issuer: 'https://idp.example.com',
    clientId: 'signalk',
    clientSecret: '',
    redirectUri: '',
    providerName: 'SSO Login',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    autoLogin: false,
    adminGroups: [],
    readwriteGroups: [],
    groupsAttribute: 'groups',
    scope: 'openid profile email',
    ...overrides
  }
}

describe('OIDC Admin Routes: environment variable values', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    OIDC_ENV_VARS.forEach((name) => {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    })
  })

  afterEach(() => {
    OIDC_ENV_VARS.forEach((name) => {
      if (savedEnv[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = savedEnv[name]
      }
    })
  })

  // A failed assertion skips any cleanup at the end of a test body, and a
  // still-listening server keeps the mocha process alive. Close them here
  // instead, so a failure reports as a failure rather than as a hang.
  const started: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (started.length) await started.pop()!()
  })

  async function startAdminRoutes() {
    const securityConfig: SecurityConfigForOIDC = {}
    const saves: SecurityConfigForOIDC[] = []

    const app = express()
    app.use(express.json())
    registerOIDCAdminRoutes(app, {
      allowConfigure: () => true,
      getSecurityConfig: () => securityConfig,
      saveSecurityConfig: (config, callback) => {
        saves.push(structuredClone(config))
        callback(null)
      }
    })

    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    started.push(
      () => new Promise<void>((resolve) => server.close(() => resolve()))
    )

    return {
      savedOidc: () => saves[saves.length - 1]?.oidc,
      put: (body: unknown) =>
        fetch(`http://127.0.0.1:${port}${OIDC_ROUTE}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
    }
  }

  it('accepts a client secret provided only via environment variable', async () => {
    process.env.SIGNALK_OIDC_CLIENT_SECRET = ENV_SECRET
    const oidc = await startAdminRoutes()

    const response = await oidc.put(
      formBody({ redirectUri: FORM_REDIRECT_URI })
    )

    expect(response.status).to.equal(200)
  })

  it('does not write an environment client secret to security.json', async () => {
    process.env.SIGNALK_OIDC_CLIENT_SECRET = ENV_SECRET
    const oidc = await startAdminRoutes()

    await oidc.put(formBody({ redirectUri: FORM_REDIRECT_URI }))

    expect(oidc.savedOidc()?.clientSecret).to.not.equal(ENV_SECRET)
    expect(oidc.savedOidc()?.clientSecret).to.be.oneOf([undefined, ''])
  })

  it('accepts an environment redirect URI without writing it to security.json', async () => {
    process.env.SIGNALK_OIDC_REDIRECT_URI = ENV_REDIRECT_URI
    const oidc = await startAdminRoutes()

    const response = await oidc.put(
      formBody({ clientSecret: 'secret-from-form' })
    )

    expect(response.status).to.equal(200)
    expect(oidc.savedOidc()?.redirectUri).to.be.oneOf([undefined, ''])
  })
})
