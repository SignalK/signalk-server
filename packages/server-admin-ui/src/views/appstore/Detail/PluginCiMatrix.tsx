import React from 'react'
import Badge from 'react-bootstrap/Badge'

// These types intentionally duplicate the TypeBox-inferred PluginCi /
// PluginCiJob from src/appstore/schemas.ts. The admin UI is published
// as its own npm package (@signalk/server-admin-ui) and can't import
// from outside its workspace without breaking that publication
// boundary. The wire shape is small and changes rarely, so this
// duplication is the lesser evil. Keep in sync if the schema gains
// new statuses or fields.
export interface PluginCiJob {
  platform: string
  node: number
  conclusion:
    | 'success'
    | 'failure'
    | 'skipped'
    | 'cancelled'
    | 'in_progress'
    | null
  server_version?: string
  job_url?: string
}

export type PluginCi =
  | { status: 'no-githead' }
  | { status: 'no-run'; head_sha: string; commit_url: string }
  | { status: 'no-plugin-ci'; head_sha: string; workflow_run_url: string }
  | {
      status: 'in-progress'
      head_sha: string
      workflow_run_url: string
      tested_at?: string
    }
  | {
      status: 'ok'
      head_sha: string
      commit_url: string
      workflow_run_url: string
      tested_at: string
      workflow_ref: string
      jobs: PluginCiJob[]
    }

interface PluginCiMatrixProps {
  data?: PluginCi
}

const PLATFORM_LABELS: Record<string, string> = {
  'linux-x64': 'Linux x64',
  'linux-arm64': 'Linux arm64',
  macos: 'macOS',
  windows: 'Windows',
  'armv7-cerbo': 'Cerbo (armv7)',
  integration: 'Integration'
}

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p
}

function conclusionVariant(c: PluginCiJob['conclusion']): string {
  switch (c) {
    case 'success':
      return 'success'
    case 'failure':
      return 'danger'
    case 'skipped':
    case 'cancelled':
      return 'secondary'
    case 'in_progress':
      return 'warning'
    default:
      return 'secondary'
  }
}

const PLUGIN_CI_DOCS_URL =
  'https://demo.signalk.org/documentation/develop/plugins/publishing.html#how-your-plugin-appears-tested-in-the-app-store'

const PluginCiMatrix: React.FC<PluginCiMatrixProps> = ({ data }) => {
  // Older registry/server combinations didn't ship the field at all.
  // Render nothing so the section is invisible rather than confusing.
  if (!data) return null

  if (
    data.status === 'no-githead' ||
    data.status === 'no-run' ||
    data.status === 'no-plugin-ci'
  ) {
    return (
      <div className="plugin-detail__plugin-ci">
        <h5 className="mt-4">plugin-ci matrix</h5>
        <p className="text-muted small mb-0">
          This plugin does not use the SignalK plugin-ci workflow.{' '}
          <a href={PLUGIN_CI_DOCS_URL} target="_blank" rel="noreferrer">
            See how to add it →
          </a>
        </p>
      </div>
    )
  }

  if (data.status === 'in-progress') {
    return (
      <div className="plugin-detail__plugin-ci">
        <h5 className="mt-4">plugin-ci matrix</h5>
        <p className="text-muted small mb-2">
          Tests are still running for{' '}
          <a
            href={data.workflow_run_url}
            target="_blank"
            rel="noreferrer"
            className="font-monospace"
          >
            {data.head_sha.slice(0, 7)}
          </a>
          {data.tested_at ? `, started ${data.tested_at.substring(0, 10)}` : ''}
          .
        </p>
      </div>
    )
  }

  // status === 'ok'
  return (
    <div className="plugin-detail__plugin-ci">
      <h5 className="mt-4">plugin-ci matrix</h5>
      <div className="text-muted small mb-2">
        Tested against the published version's commit{' '}
        <a
          href={data.commit_url}
          target="_blank"
          rel="noreferrer"
          className="font-monospace"
        >
          {data.head_sha.slice(0, 7)}
        </a>{' '}
        on{' '}
        <a href={data.workflow_run_url} target="_blank" rel="noreferrer">
          this workflow run
        </a>{' '}
        · {data.tested_at.substring(0, 10)}
      </div>
      {data.jobs.length === 0 ? (
        <div className="text-muted small">
          The workflow ran but no matrix jobs matched the expected naming.
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2">
          {data.jobs.map((j) => (
            <Badge
              key={`${j.platform}-${j.node}-${j.server_version ?? ''}`}
              bg={conclusionVariant(j.conclusion)}
              className="fw-normal plugin-detail__plugin-ci-cell"
            >
              {platformLabel(j.platform)} · Node {j.node}
              {j.server_version ? ` · sk ${j.server_version}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export default PluginCiMatrix
