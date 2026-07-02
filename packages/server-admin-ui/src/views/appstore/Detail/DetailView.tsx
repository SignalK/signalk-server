import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Nav from 'react-bootstrap/Nav'
import Spinner from 'react-bootstrap/Spinner'
import Tab from 'react-bootstrap/Tab'
import { useAppStore } from '../../../store'
import type { AppStoreState, AppInfo } from '../../../store/types'
import ActionCellRenderer from '../Grid/cell-renderers/ActionCellRenderer'
import PluginIcon from '../components/PluginIcon'
import RecencyBadge from '../components/RecencyBadge'
import UpdateAvailableBadge from '../components/UpdateAvailableBadge'
import { projectAppInfo } from '../projectAppInfo'
import ReadmeTab from './ReadmeTab'
import ChangelogTab from './ChangelogTab'
import IndicatorsTab, { IndicatorResult } from './IndicatorsTab'
import { type PluginCi } from './PluginCiMatrix'
import DependenciesSection, { DependencyReference } from './DependenciesSection'
import ScreenshotLightbox from './ScreenshotLightbox'
import WarningBox from '../Apps/WarningBox'
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
  categories?: string[]
  githubUrl?: string
  npmUrl?: string
  isPlugin?: boolean
  isWebapp?: boolean
  recent?: boolean
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
  const decodedName = useMemo(() => {
    if (!name) return ''
    try {
      return decodeURIComponent(name)
    } catch {
      return ''
    }
  }, [name])
  const appStore = useAppStore() as AppStoreState
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const listEntry = useMemo((): AppInfo | undefined => {
    if (!decodedName) return undefined
    return projectAppInfo(decodedName, appStore)
  }, [appStore, decodedName])

  const isInstalled = !!listEntry?.installedVersion

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
    if (!decodedName) return
    // Reset per-page UI state when the route switches to a different
    // plugin so a stale install/remove banner or open lightbox from
    // the previous page can't bleed into this one.
    const controller = new AbortController()
    setActionError(null)
    setLightboxIndex(null)
    setState({ status: 'loading' })
    fetch(
      `${window.serverRoutesPrefix}/appstore/plugin/${encodeURIComponent(decodedName)}`,
      { credentials: 'include', signal: controller.signal }
    )
      .then(async (res) => {
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
      .catch((err: unknown) => {
        // AbortError fires on every route change as part of the
        // cleanup contract; don't surface it as a load failure.
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Network error loading plugin details.',
          offline: true
        })
      })
    return () => {
      controller.abort()
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
        <Card>
          <Card.Body>
            <div className="plugin-detail__back mb-2">
              <NavLink
                to="/apps/store"
                className="plugin-detail__back-link"
                aria-label="Back to Store"
              >
                ← Back to Store
              </NavLink>
            </div>
            Loading {decodedName}…
          </Card.Body>
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
  const displayTitle =
    detail.displayName || listEntry?.displayName || detail.name

  // Use the synthesized list entry when the appStore has hydrated; on a
  // cold deep-link refresh the appStore lists may not yet be in scope,
  // so seed the projection with detail-payload fields so the action
  // control still has name/version/isPlugin/npmUrl to render against.
  const actionApp = listEntry ||
    projectAppInfo(decodedName, appStore, {
      version: detail.version,
      isPlugin: detail.isPlugin,
      npmUrl: detail.npmUrl
    }) || {
      name: detail.name,
      version: detail.version,
      isPlugin: detail.isPlugin,
      npmUrl: detail.npmUrl
    }

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

  const restartRequired = appStore.installing.length > 0

  return (
    <div className="plugin-detail animated fadeIn">
      {restartRequired && (
        <section className="appstore__warning section">
          <WarningBox>
            Please restart the server after installing, updating or deleting a
            plugin
          </WarningBox>
        </section>
      )}
      <Card>
        <Card.Body>
          <div className="plugin-detail__back mb-2">
            <NavLink
              to="/apps/store"
              className="plugin-detail__back-link"
              aria-label="Back to Store"
            >
              ← Back to Store
            </NavLink>
          </div>
          <div className="d-flex gap-4 flex-column flex-lg-row">
            <div className="flex-grow-1">
              <div className="d-flex gap-3 align-items-start plugin-detail__header-row">
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
                    <RecencyBadge
                      recent={detail.recent}
                      className="plugin-detail__badge"
                    />
                    <UpdateAvailableBadge
                      installedVersion={listEntry?.installedVersion}
                      newVersion={listEntry?.newVersion}
                      className="plugin-detail__badge"
                    />
                    {detail.official && <Badge bg="primary">OFFICIAL</Badge>}
                    {detail.deprecated && <Badge bg="danger">DEPRECATED</Badge>}
                  </div>
                  <h2 className="mb-1 mt-2">{displayTitle}</h2>
                  <p className="text-muted mb-2">
                    {detail.description || listEntry?.description || ''}
                  </p>
                  <div className="text-muted small d-flex gap-3 flex-wrap">
                    {(detail.author || listEntry?.author) && (
                      <span>
                        by{' '}
                        <button
                          type="button"
                          className="plugin-detail__author-button"
                          onClick={() => {
                            const author =
                              detail.author ||
                              (listEntry?.author as string | undefined)
                            if (author) {
                              navigate(
                                `/apps/store?q=${encodeURIComponent(author)}`
                              )
                            }
                          }}
                          title="Filter the store by this author"
                        >
                          <strong>
                            {detail.author || (listEntry?.author as string)}
                          </strong>
                        </button>
                      </span>
                    )}
                    {(() => {
                      const installed = listEntry?.installedVersion
                      const latest = detail.version
                      if (installed && latest && installed !== latest) {
                        return (
                          <span className="font-monospace">
                            v{installed} → v{latest}
                          </span>
                        )
                      }
                      if (installed) {
                        return (
                          <span className="font-monospace">
                            Installed v{installed}
                          </span>
                        )
                      }
                      return <span className="font-monospace">v{latest}</span>
                    })()}
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
                  {(() => {
                    const cats = detail.categories?.length
                      ? detail.categories
                      : listEntry?.categories?.length
                        ? (listEntry.categories as string[])
                        : []
                    if (cats.length === 0) return null
                    return (
                      <div className="d-flex flex-wrap gap-1 mt-2">
                        {cats.map((cat) => (
                          <Badge
                            key={cat}
                            bg="light"
                            text="dark"
                            className="fw-normal"
                          >
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                <div className="plugin-detail__header-actions d-flex flex-column align-items-stretch gap-2">
                  {!isInstalled && missingRequired.length > 0 && (
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
                          Install required plugins ({missingRequired.length + 1}
                          )
                        </>
                      )}
                    </Button>
                  )}
                  <ActionCellRenderer data={actionApp} />
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
            </div>

            {heroScreenshot && (
              <div
                className="plugin-detail__hero-shot"
                style={{ flexBasis: '320px', maxWidth: '320px', minWidth: 0 }}
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
