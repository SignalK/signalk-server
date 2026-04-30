import React from 'react'
import { NavLink } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import Spinner from 'react-bootstrap/Spinner'
import PluginIcon from '../components/PluginIcon'

export interface DependencyReference {
  name: string
  displayName?: string
  appIcon?: string
  installed: boolean
}

interface DependenciesSectionProps {
  title: string
  tone: 'required' | 'recommended'
  deps: DependencyReference[]
  installingByName?: Record<
    string,
    { isInstalling: boolean; isWaiting: boolean }
  >
}

type InstallStatus = 'installing' | 'waiting' | 'installed' | 'not-installed'

function getInstallStatus(
  busy: { isInstalling: boolean; isWaiting: boolean } | undefined,
  installed: boolean
): InstallStatus {
  if (busy?.isInstalling) return 'installing'
  if (busy?.isWaiting) return 'waiting'
  return installed ? 'installed' : 'not-installed'
}

const DependenciesSection: React.FC<DependenciesSectionProps> = ({
  title,
  tone,
  deps,
  installingByName
}) => {
  if (!deps || deps.length === 0) return null
  return (
    <div className="plugin-detail__deps">
      <div className="d-flex align-items-center gap-2 mb-2">
        <h6 className="mb-0">{title}</h6>
        {tone === 'required' && (
          <Badge bg="danger" className="fw-normal">
            Required
          </Badge>
        )}
        {tone === 'recommended' && (
          <Badge bg="info" className="fw-normal">
            Suggested
          </Badge>
        )}
      </div>
      <div className="d-flex flex-wrap gap-2">
        {deps.map((d) => {
          const status = getInstallStatus(
            installingByName?.[d.name],
            d.installed
          )
          return (
            <NavLink
              key={d.name}
              to={`/apps/store/plugin/${encodeURIComponent(d.name)}`}
              className="text-decoration-none"
            >
              <div className="plugin-detail__dep-card d-flex align-items-center gap-2">
                <PluginIcon
                  name={d.name}
                  displayName={d.displayName}
                  appIcon={d.appIcon}
                  size={28}
                />
                <div className="flex-grow-1 min-w-0">
                  <div className="plugin-detail__dep-name text-truncate">
                    {d.displayName || d.name}
                  </div>
                  {status === 'installed' && (
                    <small className="text-success">Installed</small>
                  )}
                  {status === 'not-installed' && (
                    <small className="text-muted">Not installed</small>
                  )}
                  {status === 'waiting' && (
                    <small className="text-muted d-inline-flex align-items-center gap-1">
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                      />
                      Waiting…
                    </small>
                  )}
                  {status === 'installing' && (
                    <small className="text-primary d-inline-flex align-items-center gap-1">
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                      />
                      Installing…
                    </small>
                  )}
                </div>
              </div>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

export default DependenciesSection
