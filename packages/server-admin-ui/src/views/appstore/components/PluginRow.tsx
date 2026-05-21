import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import type { AppInfo } from '../../../store/types'
import ActionCellRenderer from '../Grid/cell-renderers/ActionCellRenderer'
import PluginIcon from './PluginIcon'
import RecencyBadge from './RecencyBadge'
import UpdateAvailableBadge from './UpdateAvailableBadge'

interface PluginRowProps {
  app: AppInfo
  detailLinkBase?: string
}

const PluginRow: React.FC<PluginRowProps> = ({
  app,
  detailLinkBase = '/apps/store/plugin'
}) => {
  const navigate = useNavigate()
  const isInstalled = !!app.installedVersion
  const showDeprecated = app.deprecated && isInstalled
  const handleAuthorClick = () => {
    if (!app.author) return
    navigate(`/apps/store?q=${encodeURIComponent(app.author)}`)
  }

  return (
    <div className="plugin-row border-bottom">
      <div className="plugin-row__title-line">
        <div className="plugin-row__icon flex-shrink-0">
          <NavLink
            to={`${detailLinkBase}/${encodeURIComponent(app.name)}`}
            className="text-decoration-none"
            aria-label={`Open ${app.displayName || app.name} details`}
          >
            <PluginIcon
              name={app.name}
              displayName={app.displayName}
              appIcon={app.appIcon}
              installedIconUrl={app.installedIconUrl}
              size={28}
            />
          </NavLink>
        </div>
        <div className="plugin-row__title-block">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <NavLink
              to={`${detailLinkBase}/${encodeURIComponent(app.name)}`}
              className="text-dark text-decoration-none fw-semibold text-truncate"
            >
              {app.displayName || app.name}
            </NavLink>
            <RecencyBadge recent={app.recent} className="plugin-row__badge" />
            <UpdateAvailableBadge
              installedVersion={app.installedVersion}
              newVersion={app.newVersion}
              className="plugin-row__badge"
            />
            {app.official && (
              <Badge bg="primary" className="plugin-row__badge">
                OFFICIAL
              </Badge>
            )}
            {showDeprecated && (
              <Badge bg="danger" className="plugin-row__badge">
                DEPRECATED
              </Badge>
            )}
            <span className="text-muted small text-truncate plugin-row__desc">
              {app.description}
            </span>
          </div>
        </div>
      </div>
      <div className="plugin-row__meta">
        {app.author ? (
          <button
            type="button"
            className="text-muted small text-nowrap plugin-row__author-button"
            onClick={handleAuthorClick}
            title={`Filter by ${app.author}`}
          >
            {app.author}
          </button>
        ) : (
          <div className="text-muted small text-nowrap" />
        )}
        <div className="text-muted small text-nowrap d-none d-md-block">
          {app.categories?.[0] ?? null}
        </div>
        <div className="text-muted small font-monospace text-nowrap">
          {app.installedVersion || app.version
            ? `v${app.installedVersion || app.version}`
            : '—'}
        </div>
      </div>
      <div className="plugin-row__action-slot">
        <ActionCellRenderer data={app} />
      </div>
    </div>
  )
}

export default PluginRow
