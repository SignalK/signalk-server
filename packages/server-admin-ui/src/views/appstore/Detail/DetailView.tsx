import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Nav from 'react-bootstrap/Nav'
import Spinner from 'react-bootstrap/Spinner'
import Tab from 'react-bootstrap/Tab'
import { useAppStore } from '../../../store'
import type { AppStoreState, AppInfo } from '../../../store/types'
import PluginIcon from '../components/PluginIcon'
import ReadmeTab from './ReadmeTab'
import ChangelogTab from './ChangelogTab'
import IndicatorsTab, { IndicatorResult } from './IndicatorsTab'
import { type PluginCi } from './PluginCiMatrix'
import DependenciesSection, { DependencyReference } from './DependenciesSection'
import ScreenshotLightbox from './ScreenshotLightbox'
import '../appStore.scss'

interface DetailPayload {
  name: string
  version: string
  displayName?: string
  appIcon?: string
  installedIconUrl?: string
  screenshots: string[]
  installedScreenshotUrls?: string[]
  official: boolean
  deprecated: boolean
  description?: string
  author?: string
  githubUrl?: string
  npmUrl?: string
  isPlugin?: boolean
  isWebapp?: boolean
  readme: string
  changelog: string
  indicators?: IndicatorResult
  pluginCi?: PluginCi
  requires: DependencyReference[]
  recommends: DependencyReference[]
  readmeFormat: 'markdown'
  changelogFormat: 'markdown' | 'synthesized'
  fetchedAt: number
  fromCache?: boolean
  storeAvailable?: boolean
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; detail: DetailPayload }
  | { status: 'error'; message: string; offline?: boolean }

const DetailView: React.FC = () => {
  const { name } = useParams<{ name: string }>()
  const decodedName = name ? decodeURIComponent(name) : ''
  const appStore = useAppStore() as AppStoreState
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const listEntry = useMemo((): AppInfo | undefined => {
    if (!decodedName) return undefined
    return (
      appStore.installed.find((a) => a.name === decodedName) ||
      appStore.available.find((a) => a.name === decodedName) ||
      appStore.updates.find((a) => a.name === decodedName)
    )
  }, [appStore, decodedName])

  const isInstalled = !!listEntry?.installedVersion
  const updateAvailable = !!appStore.updates.find((u) => u.name === decodedName)

  const installingByName = useMemo(() => {
    const map: Record<string, { isInstalling: boolean; isWaiting: boolean }> =
      {}
    for (const i of appStore.installing) {
      map[i.name] = {
        isInstalling: !!i.isInstalling,
        isWaiting: !!i.isWaiting
      }
    }
    return map
  }, [appStore.installing])
  const isBusy = (name: string) => {
    const s = installingByName[name]
    return !!s && (s.isInstalling || s.isWaiting)
  }
  const thisIsBusy = isBusy(decodedName)

  useEffect(() => {
    let cancelled = false
    if (!decodedName) return
    setState({ status: 'loading' })
    fetch(
      `${window.serverRoutesPrefix}/appstore/plugin/${encodeURIComponent(decodedName)}`,
      { credentials: 'include' }
    )
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          const detail = (await res.json()) as DetailPayload
          setState({ status: 'loaded', detail })
        } else if (res.status === 503) {
          const body = await res.json().catch(() => ({}))
          setState({
            status: 'error',
            message: body.error || 'Plugin details not available offline.',
            offline: true
          })
        } else {
          setState({
            status: 'error',
            message: `Failed to load plugin details (${res.status}).`
          })
        }
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err?.message || 'Network error loading plugin details.',
          offline: true
        })
      })
    return () => {
      cancelled = true
    }
  }, [decodedName])

  if (!decodedName) {
    return (
      <Alert variant="warning">
        No plugin specified. Return to the{' '}
        <NavLink to="/apps/store">Store</NavLink>.
      </Alert>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="plugin-detail">
        <div className="mb-2">
          <NavLink to="/apps/store" className="btn btn-light btn-sm">
            ← Back to Store
          </NavLink>
        </div>
        <Card>
          <Card.Body>Loading {decodedName}…</Card.Body>
        </Card>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Card className="plugin-detail">
        <Card.Body>
          <Alert
            variant={state.offline ? 'warning' : 'danger'}
            className="mb-3"
          >
            {state.message}
          </Alert>
          <NavLink to="/apps/store" className="btn btn-light">
            Back to Store
          </NavLink>
        </Card.Body>
      </Card>
    )
  }

  const detail = state.detail
  const missingRequired = detail.requires.filter((d) => !d.installed)
  // Prefer installedScreenshotUrls (served by the local server mount, always
  // works for installed plugins) over the unpkg-CDN screenshots (which may
  // 404 when signalk.screenshots paths aren't tarball-relative).
  const effectiveScreenshots =
    detail.installedScreenshotUrls && detail.installedScreenshotUrls.length > 0
      ? detail.installedScreenshotUrls
      : detail.screenshots
  const heroScreenshot = effectiveScreenshots[0]
  const displayTitle = detail.displayName || detail.name

  const postAction = async (
    label: string,
    url: string,
    init: RequestInit
  ): Promise<void> => {
    setActionError(null)
    try {
      // credentials: 'include' is the postAction contract — every
      // appstore admin call needs the session cookie. Spread first so
      // a caller's init can't accidentally drop it.
      const res = await fetch(url, { ...init, credentials: 'include' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setActionError(
          body
            ? `${label} failed (${res.status}): ${body}`
            : `${label} failed (${res.status}).`
        )
      }
    } catch (err) {
      setActionError(
        `${label} failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const handleInstall = () => {
    postAction(
      'Install',
      `${window.serverRoutesPrefix}/appstore/install/${encodeURIComponent(
        detail.name
      )}/${encodeURIComponent(detail.version)}`,
      { method: 'POST' }
    )
  }

  const handleInstallWithDeps = () => {
    postAction(
      'Install',
      `${window.serverRoutesPrefix}/appstore/install-with-deps`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: detail.name, version: detail.version })
      }
    )
  }

  const handleRemove = () => {
    postAction(
      'Remove',
      `${window.serverRoutesPrefix}/appstore/remove/${encodeURIComponent(
        detail.name
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteData: false })
      }
    )
  }

  return (
    <div className="plugin-detail animated fadeIn">
      <div className="mb-2">
        <NavLink
          to="/apps/store"
          className="btn btn-light btn-sm"
          aria-label="Back to Store"
        >
          ← Back to Store
        </NavLink>
      </div>
      <Card>
        <Card.Body>
          <div className="d-flex gap-4 flex-column flex-lg-row">
            <div className="flex-grow-1">
              <div className="d-flex gap-3 align-items-start">
                <PluginIcon
                  name={detail.name}
                  displayName={detail.displayName}
                  appIcon={detail.appIcon}
                  installedIconUrl={detail.installedIconUrl}
                  size={80}
                />
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {/* Prefer detail-payload fields so the header renders
                        on a hard refresh of /apps/store/plugin/:name even
                        before the list state has hydrated. listEntry stays
                        as the fallback for fields the detail endpoint
                        doesn't surface. */}
                    {(detail.isPlugin ?? listEntry?.isPlugin) !== undefined && (
                      <span
                        className={`plugin-detail__typedot ${
                          (detail.isPlugin ?? listEntry?.isPlugin)
                            ? 'is-plugin'
                            : 'is-webapp'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    <code className="text-muted">{detail.name}</code>
                    {detail.official && <Badge bg="primary">OFFICIAL</Badge>}
                    {detail.deprecated && <Badge bg="danger">DEPRECATED</Badge>}
                  </div>
                  <h2 className="mb-1 mt-2">{displayTitle}</h2>
                  <p className="text-muted mb-2">
                    {detail.description ||
                      (listEntry?.description as string) ||
                      ''}
                  </p>
                  <div className="text-muted small d-flex gap-3 flex-wrap">
                    {(detail.author || listEntry?.author) && (
                      <span>
                        by{' '}
                        <strong>
                          {detail.author || (listEntry?.author as string)}
                        </strong>
                      </span>
                    )}
                    <span className="font-monospace">v{detail.version}</span>
                    {(detail.githubUrl ||
                      (listEntry?.githubUrl as string | undefined)) && (
                      <a
                        href={
                          detail.githubUrl || (listEntry?.githubUrl as string)
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHub
                      </a>
                    )}
                    {(detail.npmUrl ||
                      (listEntry?.npmUrl as string | undefined)) && (
                      <a
                        href={detail.npmUrl || (listEntry?.npmUrl as string)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        npm
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <DependenciesSection
                title="Requires"
                tone="required"
                deps={detail.requires}
                installingByName={installingByName}
              />
              <DependenciesSection
                title="Works well with"
                tone="recommended"
                deps={detail.recommends}
                installingByName={installingByName}
              />

              {actionError && (
                <Alert
                  variant="danger"
                  dismissible
                  onClose={() => setActionError(null)}
                  className="mt-3 mb-0"
                >
                  {actionError}
                </Alert>
              )}
              <div className="plugin-detail__actions mt-4 d-flex justify-content-end gap-2 flex-wrap">
                {isInstalled && listEntry?.id ? (
                  <>
                    <NavLink
                      to={`/apps/configuration/${encodeURIComponent(
                        (listEntry.id as string) || detail.name
                      )}`}
                      className="btn btn-primary"
                    >
                      Configure
                    </NavLink>
                    {updateAvailable && (
                      <Button
                        variant="success"
                        onClick={handleInstall}
                        disabled={thisIsBusy}
                      >
                        {thisIsBusy ? (
                          <>
                            <Spinner
                              as="span"
                              animation="border"
                              size="sm"
                              role="status"
                              aria-hidden="true"
                              className="me-2"
                            />
                            Updating…
                          </>
                        ) : (
                          <>Update to v{detail.version}</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline-danger"
                      onClick={handleRemove}
                      disabled={thisIsBusy}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <>
                    {missingRequired.length > 0 && (
                      <Button
                        variant="warning"
                        onClick={handleInstallWithDeps}
                        disabled={thisIsBusy}
                        title={`Installs this plugin plus ${missingRequired.length} required dependencies`}
                      >
                        {thisIsBusy ? (
                          <>
                            <Spinner
                              as="span"
                              animation="border"
                              size="sm"
                              role="status"
                              aria-hidden="true"
                              className="me-2"
                            />
                            Installing…
                          </>
                        ) : (
                          <>
                            Install required plugins (
                            {missingRequired.length + 1})
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      onClick={handleInstall}
                      disabled={thisIsBusy}
                    >
                      {thisIsBusy ? (
                        <>
                          <Spinner
                            as="span"
                            animation="border"
                            size="sm"
                            role="status"
                            aria-hidden="true"
                            className="me-2"
                          />
                          Installing…
                        </>
                      ) : (
                        <>Install</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {heroScreenshot && (
              <div
                className="plugin-detail__hero-shot"
                style={{ flexBasis: '320px', flexShrink: 0 }}
              >
                <button
                  type="button"
                  className="plugin-detail__screenshot-button"
                  onClick={() => setLightboxIndex(0)}
                  aria-label="Open screenshot viewer"
                >
                  <img
                    src={heroScreenshot}
                    alt=""
                    loading="lazy"
                    className="img-fluid rounded border"
                    style={{ aspectRatio: '16/10', objectFit: 'cover' }}
                  />
                </button>
                {effectiveScreenshots.length > 1 && (
                  <small className="text-muted d-block mt-2 text-end">
                    +{effectiveScreenshots.length - 1} more in README tab
                  </small>
                )}
              </div>
            )}
          </div>

          {detail.deprecated && (
            <Alert variant="danger" className="mt-4">
              <strong>This plugin is deprecated.</strong> The author no longer
              recommends it for new installations.
              {isInstalled && (
                <>
                  {' '}
                  Since it&apos;s installed, you can still configure or remove
                  it here.
                </>
              )}
            </Alert>
          )}

          {detail.fromCache && detail.storeAvailable === false && (
            <Alert variant="warning" className="mt-4 mb-0">
              Showing cached details from{' '}
              {new Date(detail.fetchedAt).toLocaleString()}.
            </Alert>
          )}

          <div className="mt-4">
            <Tab.Container defaultActiveKey="readme">
              <Nav variant="tabs">
                <Nav.Item>
                  <Nav.Link eventKey="readme">README</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="changelog">Changelog</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="indicators">Indicators</Nav.Link>
                </Nav.Item>
              </Nav>
              <Tab.Content className="p-3">
                <Tab.Pane eventKey="readme">
                  <ReadmeTab
                    readme={detail.readme}
                    screenshots={effectiveScreenshots}
                    packageName={detail.name}
                    version={detail.version}
                    onScreenshotClick={(i) => setLightboxIndex(i)}
                  />
                </Tab.Pane>
                <Tab.Pane eventKey="changelog">
                  <ChangelogTab
                    changelog={detail.changelog}
                    changelogFormat={detail.changelogFormat}
                    version={detail.version}
                  />
                </Tab.Pane>
                <Tab.Pane eventKey="indicators">
                  <IndicatorsTab
                    indicators={detail.indicators}
                    pluginCi={detail.pluginCi}
                  />
                </Tab.Pane>
              </Tab.Content>
            </Tab.Container>
          </div>
        </Card.Body>
      </Card>
      <ScreenshotLightbox
        screenshots={effectiveScreenshots}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  )
}

export default DetailView
