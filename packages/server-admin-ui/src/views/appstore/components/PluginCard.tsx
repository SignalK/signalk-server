import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Card from 'react-bootstrap/Card'
import Badge from 'react-bootstrap/Badge'
import ProgressBar from 'react-bootstrap/ProgressBar'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import type { AppInfo } from '../../../store/types'
import InstallLogModal from './InstallLogModal'
import PluginIcon from './PluginIcon'
import RecencyBadge from './RecencyBadge'
import ScoreRing from './ScoreRing'
import UpdateAvailableBadge from './UpdateAvailableBadge'

interface PluginCardProps {
  app: AppInfo
  detailLinkBase?: string
}

const ICON_SIZE = 48
const SCORE_RING_SIZE = 34
const MAX_CATEGORY_BADGES = 2

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

interface StatePillProps {
  app: AppInfo
  onFailedClick: () => void
}

const StatePill: React.FC<StatePillProps> = ({ app, onFailedClick }) => {
  if (app.installing) {
    if (app.isInstalling || app.isWaiting || app.isRemoving) {
      const label = app.isRemoving
        ? 'Removing'
        : app.isWaiting
          ? 'Waiting'
          : 'Installing'
      return (
        <span className="plugin-card__state-pill plugin-card__state-pill--busy">
          {label}
        </span>
      )
    }
    if (app.installFailed) {
      return (
        <button
          type="button"
          className="plugin-card__state-pill plugin-card__state-pill--failed plugin-card__state-pill-button"
          onClick={(e) => {
            e.stopPropagation()
            onFailedClick()
          }}
          title="Show the npm log for this failure"
        >
          Install failed
        </button>
      )
    }
  }
  if (app.installedVersion && app.newVersion) {
    return (
      <span className="plugin-card__state-pill plugin-card__state-pill--update">
        v{app.installedVersion} → v{app.newVersion}
      </span>
    )
  }
  if (app.installedVersion) {
    return (
      <span className="plugin-card__state-pill plugin-card__state-pill--installed">
        Installed v{app.installedVersion}
      </span>
    )
  }
  if (app.version) {
    return (
      <span className="plugin-card__state-pill plugin-card__state-pill--available">
        v{app.version}
      </span>
    )
  }
  return null
}

const PluginCard: React.FC<PluginCardProps> = ({
  app,
  detailLinkBase = '/apps/store/plugin'
}) => {
  const navigate = useNavigate()
  const [showLogModal, setShowLogModal] = React.useState(false)
  const handleAuthorClick = (e: React.MouseEvent) => {
    if (!app.author) return
    e.preventDefault()
    e.stopPropagation()
    navigate(`/apps/store?q=${encodeURIComponent(app.author)}`)
  }

  const indicators =
    typeof app.indicators === 'object' && app.indicators !== null
      ? (app.indicators as {
          score?: number
          rawMetrics?: { stars?: number; downloadsPerWeek?: number }
        })
      : undefined
  const score = indicators?.score
  const stars = indicators?.rawMetrics?.stars
  const downloads = indicators?.rawMetrics?.downloadsPerWeek
  const isInstalled = !!app.installedVersion
  const showDeprecated = app.deprecated && isInstalled

  const cardClass = app.recent
    ? `plugin-card plugin-card--recent ${
        app.installedVersion
          ? 'plugin-card--recent-updated'
          : 'plugin-card--recent-new'
      } h-100`
    : 'plugin-card h-100'

  const detailHref = `${detailLinkBase}/${encodeURIComponent(app.name)}`
  const isBusy = !!(
    app.installing &&
    (app.isInstalling || app.isWaiting || app.isRemoving)
  )

  return (
    <Card className={cardClass}>
      {/* Stretched-link pattern: the NavLink is a transparent absolute
          overlay covering the whole card so a click anywhere navigates
          to the detail page. The author <button> sits above the link
          via z-index so its click is independent and the markup stays
          interactive-in-non-interactive (no <button> nested inside an
          <a>). */}
      <NavLink
        to={detailHref}
        className="plugin-card__stretched-link"
        aria-label={`View details for ${app.displayName || app.name}`}
      />
      <Card.Body className="d-flex p-3">
        <div className="d-flex flex-grow-1 gap-3">
          <div className="flex-shrink-0">
            <PluginIcon
              name={app.name}
              displayName={app.displayName}
              appIcon={app.appIcon}
              installedIconUrl={app.installedIconUrl}
              size={ICON_SIZE}
            />
          </div>
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <h5 className="mb-0 plugin-card__title">
                {app.displayName || app.name}
              </h5>
              <RecencyBadge
                recent={app.recent}
                className="plugin-card__badge"
              />
              <UpdateAvailableBadge
                installedVersion={app.installedVersion}
                newVersion={app.newVersion}
                className="plugin-card__badge"
              />
              {app.official && (
                <Badge bg="primary" className="plugin-card__badge">
                  OFFICIAL
                </Badge>
              )}
              {showDeprecated && (
                <Badge bg="danger" className="plugin-card__badge">
                  DEPRECATED
                </Badge>
              )}
            </div>
            {app.author && (
              <button
                type="button"
                className="text-muted small plugin-card__author plugin-card__author-button"
                onClick={handleAuthorClick}
                title={`Filter by ${app.author}`}
              >
                {app.author}
              </button>
            )}
            <p className="mb-0 mt-2 plugin-card__description">
              {app.description}
            </p>
          </div>
        </div>
        {(isFiniteNumber(score) ||
          isFiniteNumber(stars) ||
          isFiniteNumber(downloads)) && (
          <div className="plugin-card__stats">
            {isFiniteNumber(score) && (
              <ScoreRing score={score} size={SCORE_RING_SIZE} />
            )}
            {isFiniteNumber(stars) && (
              <div className="plugin-card__metric" title="GitHub stars">
                <span className="plugin-card__star">★</span>
                {stars}
              </div>
            )}
            {isFiniteNumber(downloads) && (
              <div className="plugin-card__metric" title="npm downloads / week">
                ↓{formatCount(downloads)}
              </div>
            )}
          </div>
        )}
      </Card.Body>
      <Card.Footer className="d-flex align-items-center gap-2">
        <div className="flex-grow-1 d-flex flex-wrap gap-1">
          {(app.categories || []).slice(0, MAX_CATEGORY_BADGES).map((cat) => (
            <Badge key={cat} bg="light" text="dark" className="fw-normal">
              {cat}
            </Badge>
          ))}
        </div>
        <StatePill app={app} onFailedClick={() => setShowLogModal(true)} />
        <FontAwesomeIcon
          icon={faChevronRight}
          className="plugin-card__chevron text-muted"
        />
      </Card.Footer>
      <InstallLogModal
        appName={app.name}
        show={showLogModal}
        onClose={() => setShowLogModal(false)}
      />
      {isBusy && (
        <ProgressBar
          className="plugin-card__bottom-progress"
          animated
          variant="success"
          now={100}
        />
      )}
    </Card>
  )
}

const MILLION = 1_000_000
const THOUSAND = 1_000

function formatCount(n: number): string {
  if (n >= MILLION) return `${(n / MILLION).toFixed(1)}M`
  if (n >= THOUSAND) return `${(n / THOUSAND).toFixed(1)}k`
  return String(n)
}

export default PluginCard
