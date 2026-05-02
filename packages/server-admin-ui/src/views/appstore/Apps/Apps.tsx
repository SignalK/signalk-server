import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells'
import { faList } from '@fortawesome/free-solid-svg-icons/faList'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useCallback, useMemo, useDeferredValue } from 'react'
import { useAppStore } from '../../../store'
import Button from 'react-bootstrap/Button'
import ButtonGroup from 'react-bootstrap/ButtonGroup'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import type {
  AppInfo,
  AppStoreState,
  InstallingApp
} from '../../../store/types'
import AppsList, { AppsViewMode } from '../AppsList'
import WarningBox from './WarningBox'
import DeprecatedToggle from '../components/DeprecatedToggle'

import '../appStore.scss'

type SortMode = 'recent' | 'name' | 'score'

const VIEW_MODE_KEY = 'signalk.appstore.viewMode'
const SHOW_DEPRECATED_KEY = 'signalk.appstore.showDeprecated'
const SORT_MODE_KEY = 'signalk.appstore.sortMode'

const installingCount = (appStore: AppStoreState): number => {
  return appStore.installing.filter((app) => {
    const i = app as InstallingApp
    return i.isWaiting || i.isInstalling
  }).length
}

const selectedViewToFilter = (
  selectedView: string,
  appStore: AppStoreState
): ((app: AppInfo) => boolean) => {
  if (selectedView === 'Installed') {
    return (app) =>
      !!(app.installedVersion as string | undefined) || !!app.installing
  } else if (selectedView === 'Updates') {
    return (app) => updateAvailable(app, appStore)
  } else if (selectedView === 'Installing') {
    return (app) => !!app.installing
  }
  return () => true
}

const updateAvailable = (app: AppInfo, appStore: AppStoreState): boolean => {
  return !!(
    app.installedVersion &&
    app.version !== app.installedVersion &&
    appStore.updates.find((update) => update.name === app.name)
  )
}

// localStorage.getItem() can throw in restricted-storage contexts (Safari
// private mode, browsers with site-data blocked) the same way setItem can,
// so reads need the same try/catch the writes already use — otherwise the
// component fails to render at all.
function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return fallback
    return raw === 'true'
  } catch {
    return fallback
  }
}

function readString<T extends string>(
  key: string,
  allowed: T[],
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage?.getItem(key)
    if (raw && (allowed as string[]).includes(raw)) return raw as T
    return fallback
  } catch {
    return fallback
  }
}

function writeString(key: string, value: string) {
  try {
    window.localStorage?.setItem(key, value)
  } catch {
    // localStorage unavailable (private mode); silently ignore.
  }
}

const Apps: React.FC = () => {
  const appStore = useAppStore() as AppStoreState
  const [view, setSelectedView] = useState('All')
  const [category, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [viewMode, setViewModeState] = useState<AppsViewMode>(
    readString<AppsViewMode>(VIEW_MODE_KEY, ['grid', 'list'], 'grid')
  )
  const [sortMode, setSortModeState] = useState<SortMode>(
    readString<SortMode>(SORT_MODE_KEY, ['recent', 'name', 'score'], 'recent')
  )
  const [showDeprecated, setShowDeprecatedState] = useState<boolean>(
    readBool(SHOW_DEPRECATED_KEY, false)
  )

  const setViewMode = useCallback((next: AppsViewMode) => {
    setViewModeState(next)
    writeString(VIEW_MODE_KEY, next)
  }, [])

  const setSortMode = useCallback((next: SortMode) => {
    setSortModeState(next)
    writeString(SORT_MODE_KEY, next)
  }, [])

  const setShowDeprecated = useCallback((next: boolean) => {
    setShowDeprecatedState(next)
    writeString(SHOW_DEPRECATED_KEY, String(next))
  }, [])

  const deferredSearch = useDeferredValue(search)
  const isSearchStale = search !== deferredSearch

  const deriveAppList = useCallback((): AppInfo[] => {
    const allApps: Record<string, AppInfo> = appStore.available.reduce(
      (acc, app) => {
        acc[app.name] = { ...app }
        return acc
      },
      {} as Record<string, AppInfo>
    )

    appStore.installed.forEach((app) => {
      const update = appStore.updates.find((u) => u.name === app.name)
      allApps[app.name] = {
        ...app,
        installed: true,
        newVersion: update ? app.version : undefined,
        updateDisabled: update?.updateDisabled
      }
    })

    appStore.installing.forEach((app) => {
      if (allApps[app.name]) {
        // Only carry the install-state flags forward; the rest of
        // app.installing entries are not AppInfo-shaped, so spreading
        // them into AppInfo via `as unknown as` would erase real fields.
        allApps[app.name] = {
          ...allApps[app.name],
          installing: true,
          isInstalling: app.isInstalling,
          isWaiting: app.isWaiting,
          isRemoving: app.isRemoving,
          isRemove: app.isRemove,
          installFailed: app.installFailed
        }
      }
    })

    const list = Object.values(allApps)
    const sorted = [...list]
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortMode === 'score') {
      const score = (a: AppInfo) =>
        (a.indicators as { score?: number } | undefined)?.score ?? -1
      sorted.sort((a, b) => score(b) - score(a))
    } else {
      // Apps without an `updated` field sort to the bottom of
      // "recently updated" via the epoch fallback — older than any
      // real release date.
      const updatedAt = (a: AppInfo) =>
        typeof a.updated === 'string' ? Date.parse(a.updated) || 0 : 0
      sorted.sort((a, b) => updatedAt(b) - updatedAt(a))
    }
    return sorted
  }, [appStore, sortMode])

  const hiddenDeprecatedCount = useMemo(() => {
    if (showDeprecated) return 0
    return deriveAppList().filter((a) => a.deprecated && !a.installedVersion)
      .length
  }, [deriveAppList, showDeprecated])

  const rowData = useMemo(() => {
    const selectedViewFilter = selectedViewToFilter(view, appStore)
    const selectedCategoryFilter =
      category === 'All'
        ? () => true
        : (app: AppInfo) => app.categories?.includes(category) ?? false
    const textSearchFilter =
      deferredSearch === ''
        ? () => true
        : (app: AppInfo) => {
            const lower = deferredSearch.toLowerCase()
            return (app.name.toLowerCase().includes(lower) ||
              (app.displayName &&
                app.displayName.toLowerCase().includes(lower)) ||
              (app.description &&
                app.description.toLowerCase().includes(lower))) as boolean
          }
    const deprecatedFilter = (app: AppInfo) =>
      showDeprecated || !app.deprecated || !!app.installedVersion

    return deriveAppList()
      .filter(selectedViewFilter)
      .filter(selectedCategoryFilter)
      .filter(textSearchFilter)
      .filter(deprecatedFilter)
  }, [appStore, view, category, deferredSearch, deriveAppList, showDeprecated])

  const handleUpdateAll = useCallback(() => {
    if (confirm(`Are you sure you want to install all updates?`)) {
      for (const app of rowData) {
        if (app.newVersion && app.installed && !app.updateDisabled) {
          fetch(
            `${window.serverRoutesPrefix}/appstore/install/${app.name}/${app.version}`,
            {
              method: 'POST',
              credentials: 'include'
            }
          )
        }
      }
    }
  }, [rowData])

  let warning: string | undefined
  if (appStore.storeAvailable === false) {
    warning = `You probably don't have Internet connectivity and Appstore can not be reached. Showing cached and installed data.`
  } else if (appStore.installing.length > 0) {
    warning =
      'Please restart the server after installing, updating or deleting a plugin'
  }

  return (
    <div className="appstore animated fadeIn">
      {warning && (
        <section className="appstore__warning section">
          <WarningBox>{warning}</WarningBox>
        </section>
      )}

      <Card>
        <Card.Header className="appstore__header">
          <div className="title__container">
            <Card.Title>Apps & Plugins</Card.Title>
            <div className="button-wrapper">
              <Button
                variant={view === 'All' ? 'secondary' : 'light'}
                onClick={() => setSelectedView('All')}
              >
                All
              </Button>
              <Button
                variant={view === 'Installed' ? 'secondary' : 'light'}
                onClick={() => setSelectedView('Installed')}
              >
                Installed
              </Button>
              <Button
                variant={view === 'Updates' ? 'secondary' : 'light'}
                onClick={() => setSelectedView('Updates')}
              >
                Updates
                {appStore.updates.length > 0 && (
                  <span className="badge__update">
                    {appStore.updates.length}
                  </span>
                )}
              </Button>
              {appStore.installing.length > 0 && (
                <>
                  <Button
                    variant={view === 'Installing' ? 'secondary' : 'light'}
                    onClick={() => setSelectedView('Installing')}
                  >
                    Installs & Removes
                    {installingCount(appStore) > 0 && (
                      <span className="badge__update">
                        {installingCount(appStore)}
                      </span>
                    )}
                  </Button>
                  {appStore.installing.length > 0 && '(Pending restart)'}
                </>
              )}
            </div>
          </div>

          <div className="action__container">
            {view === 'Updates' && appStore.updates.length > 0 ? (
              <Button
                variant="success"
                onClick={handleUpdateAll}
                className="text-nowrap"
              >
                Update all
              </Button>
            ) : undefined}

            <Form.Select
              size="sm"
              className="appstore__sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Sort order"
            >
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
              <option value="score">Indicator score</option>
            </Form.Select>

            <ButtonGroup aria-label="View mode" size="sm">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'light'}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <FontAwesomeIcon icon={faTableCells} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'light'}
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                <FontAwesomeIcon icon={faList} />
              </Button>
            </ButtonGroup>

            <div className="search">
              <label htmlFor="search-text-box" className="visually-hidden">
                Search apps and plugins
              </label>
              <FontAwesomeIcon
                className="search__icon"
                icon={faMagnifyingGlass}
              />
              <Form.Control
                id="search-text-box"
                className="search__input"
                placeholder="Search ..."
                autoComplete="off"
                onInput={(e) => {
                  setSearch((e.target as HTMLInputElement).value)
                }}
                value={search}
              />
            </div>
          </div>
        </Card.Header>

        <Card.Body>
          <section className="appstore__tags section">
            {appStore.categories?.map((item) => (
              <Button
                key={item}
                variant={category === item ? 'secondary' : 'outline-secondary'}
                onClick={() => setSelectedCategory(item)}
              >
                {item}
              </Button>
            ))}
          </section>
          <DeprecatedToggle
            count={hiddenDeprecatedCount}
            enabled={showDeprecated}
            onChange={setShowDeprecated}
          />
          <section className="appstore__grid">
            <div
              style={{
                height: '100%',
                opacity: isSearchStale ? 0.7 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              <AppsList apps={rowData} viewMode={viewMode} />
            </div>
          </section>
        </Card.Body>
      </Card>
    </div>
  )
}

export default Apps
