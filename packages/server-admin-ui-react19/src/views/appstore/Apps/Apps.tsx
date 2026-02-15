import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useCallback, useMemo, useDeferredValue } from 'react'
import { useAppStore } from '../../../store'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input
} from 'reactstrap'
import AppsList from '../AppsList'
import WarningBox from './WarningBox'

import '../appStore.scss'

interface InstallingApp {
  name: string
  isWaiting?: boolean
  isInstalling?: boolean
}

interface AppInfo {
  name: string
  description?: string
  version: string
  installedVersion?: string
  installed?: boolean
  installing?: boolean
  newVersion?: string
  prereleaseVersion?: string
  updated?: string
  categories: string[]
  [key: string]: unknown
}

interface AppStore {
  storeAvailable: boolean
  available: AppInfo[]
  installed: AppInfo[]
  installing: InstallingApp[]
  updates: AppInfo[]
  categories?: string[]
}

const installingCount = (appStore: AppStore): number => {
  return appStore.installing.filter((app) => {
    return app.isWaiting || app.isInstalling
  }).length
}

const selectedViewToFilter = (
  selectedView: string,
  appStore: AppStore
): ((app: AppInfo) => boolean) => {
  if (selectedView === 'Installed') {
    return (app) => !!app.installedVersion || !!app.installing
  } else if (selectedView === 'Updates') {
    return (app) => updateAvailable(app, appStore)
  } else if (selectedView === 'Installing') {
    return (app) => !!app.installing
  }
  return () => true
}

const updateAvailable = (app: AppInfo, appStore: AppStore): boolean => {
  return !!(
    app.installedVersion &&
    app.version !== app.installedVersion &&
    appStore.updates.find((update) => update.name === app.name)
  )
}

const Apps: React.FC = () => {
  const appStore = useAppStore() as AppStore
  const [view, setSelectedView] = useState('All')
  const [category, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')

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
      allApps[app.name] = {
        ...app,
        installed: true,
        newVersion: updateAvailable(app, appStore) ? app.version : undefined
      }
    })

    appStore.installing.forEach((app) => {
      if (allApps[app.name]) {
        allApps[app.name] = { ...allApps[app.name], ...app, installing: true }
      }
    })

    return Object.values(allApps).sort(
      (a, b) =>
        new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime()
    )
  }, [appStore])

  const rowData = useMemo(() => {
    const selectedViewFilter = selectedViewToFilter(view, appStore)
    const selectedCategoryFilter =
      category === 'All'
        ? () => true
        : (app: AppInfo) => app.categories?.includes(category)
    const textSearchFilter =
      deferredSearch === ''
        ? () => true
        : (app: AppInfo) => {
            const lower = deferredSearch.toLowerCase()
            return (
              app.name.toLowerCase().indexOf(lower) >= 0 ||
              (app.description &&
                app.description.toLowerCase().indexOf(lower) >= 0)
            )
          }

    return deriveAppList()
      .filter(selectedViewFilter)
      .filter(selectedCategoryFilter)
      .filter(textSearchFilter)
  }, [appStore, view, category, deferredSearch, deriveAppList])

  const handleUpdateAll = useCallback(() => {
    if (confirm(`Are you sure you want to install all updates?`)) {
      for (const app of rowData) {
        if (app.newVersion && app.installed) {
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
    warning = `You probably don't have Internet connectivity and Appstore can not be reached.`
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
        <CardHeader className="appstore__header">
          <div className="title__container">
            <CardTitle>Apps & Plugins</CardTitle>
            <div className="button-wrapper">
              <Button
                color={view === 'All' ? 'secondary' : 'light'}
                onClick={() => setSelectedView('All')}
              >
                All
              </Button>
              <Button
                color={view === 'Installed' ? 'secondary' : 'light'}
                onClick={() => setSelectedView('Installed')}
              >
                Installed
              </Button>
              <Button
                color={view === 'Updates' ? 'secondary' : 'light'}
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
                    color={view === 'Installing' ? 'secondary' : 'light'}
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
              <Button color="success" onClick={handleUpdateAll}>
                Update all
              </Button>
            ) : undefined}

            <div className="search">
              <label htmlFor="search-text-box" className="visually-hidden">
                Search apps and plugins
              </label>
              <FontAwesomeIcon
                className="search__icon"
                icon={faMagnifyingGlass}
              />
              <Input
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
        </CardHeader>

        <CardBody>
          <section className="appstore__tags section">
            {appStore.categories?.map((item) => (
              <Button
                key={item}
                color="secondary"
                className={category === item ? 'active' : undefined}
                outline
                onClick={() => setSelectedCategory(item)}
              >
                {item}
              </Button>
            ))}
          </section>
          <section className="appstore__grid">
            <div
              style={{
                height: '100%',
                opacity: isSearchStale ? 0.7 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              <AppsList apps={rowData} />
            </div>
          </section>
        </CardBody>
      </Card>
    </div>
  )
}

export default Apps
