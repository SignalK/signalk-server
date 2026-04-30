import { expect } from 'chai'
import { Value } from '@sinclair/typebox/value'
import {
  AppStoreEntryExtensionSchema,
  IndicatorCheckSchema,
  IndicatorResultSchema,
  PluginCiSchema,
  PluginDetailPayloadSchema,
  SignalKPackageMetadataSchema
} from '../../dist/appstore/schemas.js'

describe('appstore/schemas', () => {
  it('accepts a valid SignalK package metadata block', () => {
    const value = {
      displayName: 'Example',
      appIcon: './icon.png',
      screenshots: ['./a.png', './b.png'],
      requires: ['signalk-charts-plugin'],
      recommends: ['@signalk/freeboard-sk']
    }
    expect(Value.Check(SignalKPackageMetadataSchema, value)).to.equal(true)
  })

  it('accepts an empty metadata block', () => {
    expect(Value.Check(SignalKPackageMetadataSchema, {})).to.equal(true)
  })

  it('rejects non-string screenshots', () => {
    const value = { screenshots: [1, 2, 3] }
    expect(Value.Check(SignalKPackageMetadataSchema, value)).to.equal(false)
  })

  it('rejects non-string requires entries', () => {
    const value = { requires: ['ok', 42] }
    expect(Value.Check(SignalKPackageMetadataSchema, value)).to.equal(false)
  })

  it('indicator check rejects unknown status', () => {
    const check = {
      id: 'x',
      status: 'pending',
      title: 't',
      subtitle: 's'
    }
    expect(Value.Check(IndicatorCheckSchema, check)).to.equal(false)
  })

  it('indicator result enforces score range', () => {
    const bad = {
      score: 150,
      checks: [],
      rawMetrics: {}
    }
    expect(Value.Check(IndicatorResultSchema, bad)).to.equal(false)
  })

  it('entry extension requires official and deprecated booleans', () => {
    const bad = {
      readmeUrl: 'https://x'
    }
    expect(Value.Check(AppStoreEntryExtensionSchema, bad)).to.equal(false)
  })

  it('entry extension accepts minimal valid payload', () => {
    const ok = {
      official: false,
      deprecated: false,
      readmeUrl: 'https://unpkg.com/pkg@1.0.0/README.md'
    }
    expect(Value.Check(AppStoreEntryExtensionSchema, ok)).to.equal(true)
  })

  it('plugin detail payload round-trips a realistic record', () => {
    const payload = {
      name: 'signalk-example',
      version: '1.0.0',
      screenshots: [],
      official: false,
      deprecated: false,
      readme: '# hi',
      changelog: '',
      requires: [
        { name: 'signalk-charts-plugin', installed: false },
        { name: '@signalk/freeboard-sk', installed: true }
      ],
      recommends: [],
      readmeFormat: 'markdown',
      changelogFormat: 'synthesized',
      fetchedAt: 0,
      fromCache: false
    }
    expect(Value.Check(PluginDetailPayloadSchema, payload)).to.equal(true)
  })

  it('plugin detail payload rejects missing required arrays', () => {
    const bad = {
      name: 'x',
      version: '1.0.0',
      screenshots: [],
      official: false,
      deprecated: false,
      readme: '',
      changelog: '',
      readmeFormat: 'markdown',
      changelogFormat: 'markdown',
      fetchedAt: 0,
      fromCache: false
    }
    expect(Value.Check(PluginDetailPayloadSchema, bad)).to.equal(false)
  })

  describe('PluginCiSchema', () => {
    it('accepts no-githead', () => {
      expect(Value.Check(PluginCiSchema, { status: 'no-githead' })).to.equal(
        true
      )
    })

    it('accepts no-run with required fields', () => {
      expect(
        Value.Check(PluginCiSchema, {
          status: 'no-run',
          head_sha: 'abc',
          commit_url: 'https://github.com/o/r/commit/abc'
        })
      ).to.equal(true)
    })

    it('rejects no-run missing commit_url', () => {
      expect(
        Value.Check(PluginCiSchema, { status: 'no-run', head_sha: 'abc' })
      ).to.equal(false)
    })

    it('accepts in-progress with optional tested_at', () => {
      expect(
        Value.Check(PluginCiSchema, {
          status: 'in-progress',
          head_sha: 'abc',
          workflow_run_url: 'https://github.com/o/r/actions/runs/1'
        })
      ).to.equal(true)
    })

    it('accepts ok with empty jobs', () => {
      expect(
        Value.Check(PluginCiSchema, {
          status: 'ok',
          head_sha: 'abc',
          commit_url: 'https://x',
          workflow_run_url: 'https://y',
          tested_at: '2026-04-25T00:00:00Z',
          workflow_ref: 'refs/heads/master',
          jobs: []
        })
      ).to.equal(true)
    })

    it('accepts ok with a populated job array', () => {
      expect(
        Value.Check(PluginCiSchema, {
          status: 'ok',
          head_sha: 'abc',
          commit_url: 'https://x',
          workflow_run_url: 'https://y',
          tested_at: '2026-04-25T00:00:00Z',
          workflow_ref: 'refs/heads/master',
          jobs: [
            { platform: 'linux-x64', node: 22, conclusion: 'success' },
            { platform: 'armv7-cerbo', node: 20, conclusion: 'success' },
            {
              platform: 'integration',
              node: 22,
              conclusion: 'skipped',
              server_version: 'latest'
            },
            // Future-proof: unknown platform string is accepted via Type.String fallback
            { platform: 'experimental', node: 24, conclusion: null }
          ]
        })
      ).to.equal(true)
    })

    it('rejects ok with an unknown conclusion', () => {
      expect(
        Value.Check(PluginCiSchema, {
          status: 'ok',
          head_sha: 'abc',
          commit_url: 'https://x',
          workflow_run_url: 'https://y',
          tested_at: '2026-04-25T00:00:00Z',
          workflow_ref: 'refs/heads/master',
          jobs: [{ platform: 'linux-x64', node: 22, conclusion: 'pending' }]
        })
      ).to.equal(false)
    })

    it('rejects an unknown status', () => {
      expect(Value.Check(PluginCiSchema, { status: 'banana' })).to.equal(false)
    })
  })

  it('plugin detail payload accepts the new optional pluginCi field', () => {
    const payload = {
      name: 'p',
      version: '1.0.0',
      screenshots: [],
      official: false,
      deprecated: false,
      readme: '',
      changelog: '',
      requires: [],
      recommends: [],
      readmeFormat: 'markdown',
      changelogFormat: 'synthesized',
      fetchedAt: 0,
      fromCache: false,
      pluginCi: { status: 'no-githead' }
    }
    expect(Value.Check(PluginDetailPayloadSchema, payload)).to.equal(true)
  })
})
