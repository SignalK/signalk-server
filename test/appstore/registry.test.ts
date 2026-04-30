import { expect } from 'chai'
import {
  badgesToIndicators,
  RegistryIndexSchema,
  RegistryPluginDetailSchema
} from '../../dist/appstore/registry.js'
import { Value } from '@sinclair/typebox/value'

describe('appstore/registry schema', () => {
  it('accepts a realistic index document', () => {
    const idx = {
      generated: '2026-04-23T04:46:43.384Z',
      server_version: '2.24.0',
      plugin_count: 2,
      plugins: [
        {
          name: '@signalk/freeboard-sk',
          version: '2.21.0',
          composite_stable: 100,
          badges_stable: ['compatible', 'loads', 'activates', 'tested'],
          test_status: 'passing',
          last_tested: '2026-04-20T04:48:56.389Z',
          installs: true,
          loads: true,
          activates: true,
          providers: []
        },
        {
          name: 'signalk-minimal',
          composite_stable: 50
        }
      ]
    }
    expect(Value.Check(RegistryIndexSchema, idx)).to.equal(true)
  })

  it('accepts a plugin detail document', () => {
    const detail = {
      name: 'advancedwind',
      versions: {
        '2.6.3': {
          'server@stable': {
            installs: true,
            loads: true,
            activates: true,
            composite: 75,
            badges: ['compatible', 'loads', 'activates', 'npm-audit-ok'],
            test_status: 'none'
          }
        }
      }
    }
    expect(Value.Check(RegistryPluginDetailSchema, detail)).to.equal(true)
  })
})

describe('appstore/registry badgesToIndicators', () => {
  it('marks compatible/loads/activates as ok when present', () => {
    const r = badgesToIndicators(
      ['compatible', 'loads', 'activates', 'tested', 'npm-audit-ok'],
      100
    )
    expect(r.score).to.equal(100)
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]))
    expect(byId.compatible.status).to.equal('ok')
    expect(byId.loads.status).to.equal('ok')
    expect(byId.activates.status).to.equal('ok')
    expect(byId.tested.status).to.equal('ok')
    expect(byId.audit.status).to.equal('ok')
  })

  it('marks tested as fail when tests-failing badge present', () => {
    const r = badgesToIndicators(['compatible', 'tests-failing'], 50)
    const tested = r.checks.find((c) => c.id === 'tested')
    expect(tested?.status).to.equal('fail')
  })

  it('marks tested as warn when no test badges present', () => {
    const r = badgesToIndicators(['compatible', 'loads', 'activates'], 50)
    const tested = r.checks.find((c) => c.id === 'tested')
    expect(tested?.status).to.equal('warn')
  })

  it('marks audit as fail when audit-critical', () => {
    const r = badgesToIndicators(['compatible', 'audit-critical'], 60)
    const audit = r.checks.find((c) => c.id === 'audit')
    expect(audit?.status).to.equal('fail')
  })

  it('marks audit as warn for moderate/high', () => {
    expect(
      badgesToIndicators(['audit-moderate'], 50).checks.find(
        (c) => c.id === 'audit'
      )?.status
    ).to.equal('warn')
    expect(
      badgesToIndicators(['audit-high'], 50).checks.find(
        (c) => c.id === 'audit'
      )?.status
    ).to.equal('warn')
  })

  it('includes has-providers as an ok check when present', () => {
    const r = badgesToIndicators(['compatible', 'has-providers'], 30)
    expect(r.checks.find((c) => c.id === 'has-providers')?.status).to.equal(
      'ok'
    )
  })

  it('defaults score to 0 when composite is missing', () => {
    const r = badgesToIndicators(['compatible'], undefined)
    expect(r.score).to.equal(0)
  })

  it('handles undefined badges gracefully', () => {
    const r = badgesToIndicators(undefined, 10)
    expect(r.score).to.equal(10)
    expect(r.checks).to.have.length.greaterThan(0)
  })
})

describe('appstore/registry plugin_ci passthrough', () => {
  it('accepts an index entry with plugin_ci status=ok', () => {
    const entry = {
      name: '@signalk/app-dock',
      version: '0.3.2',
      composite_stable: 100,
      plugin_ci: {
        status: 'ok',
        head_sha: '9d951dd54c4bb4d9299ca8c3f4504db7e942f814',
        commit_url:
          'https://github.com/SignalK/app-dock/commit/9d951dd54c4bb4d9299ca8c3f4504db7e942f814',
        workflow_run_url:
          'https://github.com/SignalK/app-dock/actions/runs/24909301821',
        tested_at: '2026-04-24T20:03:53Z',
        workflow_ref: 'refs/heads/master',
        jobs: [
          { platform: 'linux-x64', node: 22, conclusion: 'success' },
          { platform: 'armv7-cerbo', node: 20, conclusion: 'success' }
        ]
      }
    }
    expect(Value.Check(RegistryIndexSchema, { plugins: [entry] })).to.equal(
      true
    )
  })

  it('accepts an index entry with plugin_ci status=no-githead', () => {
    const entry = {
      name: 'p',
      composite_stable: 50,
      plugin_ci: { status: 'no-githead' }
    }
    expect(Value.Check(RegistryIndexSchema, { plugins: [entry] })).to.equal(
      true
    )
  })

  it('accepts plugin_ci status=in-progress with optional tested_at', () => {
    const entry = {
      name: 'p',
      composite_stable: 0,
      plugin_ci: {
        status: 'in-progress',
        head_sha: 'abc',
        workflow_run_url: 'https://github.com/o/r/actions/runs/1'
      }
    }
    expect(Value.Check(RegistryIndexSchema, { plugins: [entry] })).to.equal(
      true
    )
  })

  it('rejects an index entry with an unknown plugin_ci status', () => {
    const entry = {
      name: 'p',
      composite_stable: 50,
      plugin_ci: { status: 'banana' }
    }
    expect(Value.Check(RegistryIndexSchema, { plugins: [entry] })).to.equal(
      false
    )
  })

  it('rejects plugin_ci ok when required fields are missing', () => {
    const entry = {
      name: 'p',
      composite_stable: 50,
      plugin_ci: {
        status: 'ok',
        head_sha: 'x'
        // missing commit_url, workflow_run_url, tested_at, workflow_ref, jobs
      }
    }
    expect(Value.Check(RegistryIndexSchema, { plugins: [entry] })).to.equal(
      false
    )
  })
})
