import React from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import ScoreRing from '../components/ScoreRing'
import PluginCiMatrix, { type PluginCi } from './PluginCiMatrix'

interface Check {
  id: string
  status: 'ok' | 'warn' | 'fail'
  title: string
  subtitle: string
  unknown?: boolean
}

interface RawMetrics {
  stars?: number
  downloadsPerWeek?: number
  openIssues?: number
  contributors?: number
  lastReleaseDate?: string
}

export interface IndicatorResult {
  score: number
  checks: Check[]
  rawMetrics: RawMetrics
}

interface IndicatorsTabProps {
  indicators?: IndicatorResult
  pluginCi?: PluginCi
}

const statusToVariant: Record<Check['status'], string> = {
  ok: 'success',
  warn: 'warning',
  fail: 'danger'
}

const IndicatorsTab: React.FC<IndicatorsTabProps> = ({
  indicators,
  pluginCi
}) => {
  if (!indicators) {
    return (
      <Alert variant="warning" className="mb-0">
        Indicators are not available for this plugin.
      </Alert>
    )
  }
  const { score, checks, rawMetrics } = indicators
  // Match the rounding/clamping ScoreRing applies internally so the
  // ring and the numeric label always show the same value.
  const normalizedScore = Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : 0

  return (
    <div className="plugin-detail__indicators">
      <Alert variant="warning">
        <strong>These indicators are heuristic, not definitive.</strong>{' '}
        They&apos;re intended as feedback for plugin authors and context for
        users — not as a judgment of a plugin&apos;s usefulness. A low score
        doesn&apos;t mean a plugin is bad, and a high score doesn&apos;t mean it
        fits your setup.
      </Alert>

      <div className="d-flex align-items-center gap-3 mb-4">
        <div className="flex-shrink-0">
          <ScoreRing score={normalizedScore} size={64} />
        </div>
        <div className="min-w-0">
          <div className="h4 mb-0">{normalizedScore} / 100</div>
          <div className="text-muted">
            Composite score from the{' '}
            <a
              href="https://dirkwa.github.io/signalk-plugin-registry/"
              target="_blank"
              rel="noreferrer"
            >
              Signal K Plugin Registry
            </a>
          </div>
        </div>
      </div>

      <h5>Automated checks</h5>
      <ul className="list-unstyled plugin-detail__checks">
        {checks.map((c) => (
          <li key={c.id} className="d-flex align-items-start gap-2 py-2">
            <Badge
              bg={c.unknown ? 'secondary' : statusToVariant[c.status]}
              className="mt-1"
            >
              {c.unknown ? 'N/A' : c.status.toUpperCase()}
            </Badge>
            <div>
              <div className="fw-semibold">{c.title}</div>
              <div className="text-muted small">{c.subtitle}</div>
            </div>
          </li>
        ))}
      </ul>

      <PluginCiMatrix data={pluginCi} />

      <h5 className="mt-4">Raw metrics</h5>
      <dl className="row">
        <dt className="col-sm-4">GitHub stars</dt>
        <dd className="col-sm-8">{rawMetrics.stars ?? '—'}</dd>
        <dt className="col-sm-4">npm downloads / week</dt>
        <dd className="col-sm-8">{rawMetrics.downloadsPerWeek ?? '—'}</dd>
        <dt className="col-sm-4">Open issues</dt>
        <dd className="col-sm-8">{rawMetrics.openIssues ?? '—'}</dd>
        <dt className="col-sm-4">Contributors</dt>
        <dd className="col-sm-8">{rawMetrics.contributors ?? '—'}</dd>
        <dt className="col-sm-4">Last release</dt>
        <dd className="col-sm-8">
          {rawMetrics.lastReleaseDate
            ? rawMetrics.lastReleaseDate.substring(0, 10)
            : '—'}
        </dd>
      </dl>
      <p className="text-muted small mt-3 mb-0">
        Metrics are informational only — popularity ≠ quality ≠ fit for your
        setup.
      </p>
    </div>
  )
}

export default IndicatorsTab
