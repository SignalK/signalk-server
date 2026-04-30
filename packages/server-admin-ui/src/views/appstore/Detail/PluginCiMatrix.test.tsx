import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginCiMatrix, { type PluginCi } from './PluginCiMatrix'

describe('PluginCiMatrix', () => {
  it('renders nothing when data is undefined (older registry)', () => {
    const { container } = render(<PluginCiMatrix data={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the no-CI text for status no-githead / no-run / no-plugin-ci', () => {
    const cases: PluginCi[] = [
      { status: 'no-githead' },
      {
        status: 'no-run',
        head_sha: 'abc',
        commit_url: 'https://x'
      },
      {
        status: 'no-plugin-ci',
        head_sha: 'abc',
        workflow_run_url: 'https://y'
      }
    ]
    for (const data of cases) {
      const { unmount } = render(<PluginCiMatrix data={data} />)
      expect(
        screen.getByText(/does not use the SignalK plugin-ci workflow/)
      ).toBeDefined()
      unmount()
    }
  })

  it('renders the in-progress message with short SHA', () => {
    render(
      <PluginCiMatrix
        data={{
          status: 'in-progress',
          head_sha: '1234567890abcdef',
          workflow_run_url: 'https://github.com/o/r/actions/runs/1',
          tested_at: '2026-04-25T12:00:00Z'
        }}
      />
    )
    expect(screen.getByText(/Tests are still running for/)).toBeDefined()
    expect(screen.getByText('1234567')).toBeDefined()
  })

  it('renders ok status with one badge per job', () => {
    render(
      <PluginCiMatrix
        data={{
          status: 'ok',
          head_sha: '9d951dd54c4bb4d',
          commit_url: 'https://github.com/SignalK/app-dock/commit/9d951dd',
          workflow_run_url:
            'https://github.com/SignalK/app-dock/actions/runs/24909301821',
          tested_at: '2026-04-24T20:03:53Z',
          workflow_ref: 'refs/heads/master',
          jobs: [
            { platform: 'linux-x64', node: 22, conclusion: 'success' },
            { platform: 'linux-arm64', node: 22, conclusion: 'success' },
            { platform: 'macos', node: 22, conclusion: 'success' },
            { platform: 'windows', node: 22, conclusion: 'success' },
            { platform: 'armv7-cerbo', node: 20, conclusion: 'success' }
          ]
        }}
      />
    )
    expect(screen.getByText(/Linux x64 · Node 22/)).toBeDefined()
    expect(screen.getByText(/Linux arm64 · Node 22/)).toBeDefined()
    expect(screen.getByText(/macOS · Node 22/)).toBeDefined()
    expect(screen.getByText(/Windows · Node 22/)).toBeDefined()
    expect(screen.getByText(/Cerbo \(armv7\) · Node 20/)).toBeDefined()
    expect(screen.getByText('9d951dd')).toBeDefined()
  })

  it('does not surface workflow_ref \u2014 it is GitHub runner metadata, not what was tested', () => {
    render(
      <PluginCiMatrix
        data={{
          status: 'ok',
          head_sha: 'abc',
          commit_url: 'https://x',
          workflow_run_url: 'https://y',
          tested_at: '2026-04-25T00:00:00Z',
          workflow_ref: 'refs/heads/feature-x',
          jobs: []
        }}
      />
    )
    // The matrix should not warn about workflow_ref. The published commit
    // (head_sha) is what the tarball was built from \u2014 that's what users
    // install \u2014 and the run link tells the rest of the story.
    expect(screen.queryByText(/refs\/heads\/feature-x/)).toBeNull()
  })

  it('omits cells the plugin author disabled (e.g. armv7 missing)', () => {
    render(
      <PluginCiMatrix
        data={{
          status: 'ok',
          head_sha: 'abc',
          commit_url: 'https://x',
          workflow_run_url: 'https://y',
          tested_at: '2026-04-25T00:00:00Z',
          workflow_ref: 'refs/heads/master',
          jobs: [{ platform: 'linux-x64', node: 22, conclusion: 'success' }]
        }}
      />
    )
    expect(screen.queryByText(/Cerbo/)).toBeNull()
  })
})
