import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
} from 'reactstrap'
import AppsList from '../AppsList'
import WarningBox from './WarningBox'

import '../appStore.scss'

const Apps = function (props) {
  const [view, setSelectedView] = useState('All')
  const [category, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState(() => '')

  const deriveAppList = () => {
    const allApps = props.appStore.available.reduce((acc, app) => {
      acc[app.name] = app
      return acc
    }, {})
    props.appStore.installed.forEach(
      (app) =>
        (allApps[app.name] = {
          ...app,
          installed: true,
          newVersion:
            app.installedVersion !== app.version &&
            props.appStore.updates.find((update) => update.name === app.name)
              ? app.version
              : null,
        })
    )
    props.appStore.installing.forEach(
      (app) => ((allApps[app.name] || {}).installing = true)
    )
    return Object.values(allApps).sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    )
  }

  const handleUpdateAll = () => {
    if (confirm(`Are you sure you want to install all updates?`)) {
      // Iterate over all apps to be updated
      for (const app of rowData) {
        if (app.newVersion && app.installed) {
          fetch(
            `${window.serverRoutesPrefix}/appstore/install/${app.name}/${app.version}`,
            {
              method: 'POST',
              credentials: 'include',
            }
          )
        }
      }
    }
  }

  /* 
  Show different warning message
  whether the store is available or if an app was installed or removed
  */
  let warning
  if (props.appStore.storeAvailable === false) {
    warning = `You probably don't have Internet connectivity and Appstore can not be reached.`
  } else if (props.appStore.installing.length > 0) {
    warning =
      'Please restart the server after installing, updating or deleting a plugin'
  }

  const selectedViewFilter = selectedViewToFilter(view, props.appStore)
  const selectedCategoryFilter =
    category === 'All' ? () => true : (app) => app.categories.includes(category)
  const textSearchFilter =
    search === ''
      ? () => true
      : (app) => {
          const lower = search.toLowerCase()
          return (
            app.name.toLowerCase().indexOf(lower) >= 0 ||
            (app.description &&
              app.description.toLowerCase().indexOf(lower) >= 0)
          )
        }
  const rowData = deriveAppList()
    .filter(selectedViewFilter)
    .filter(selectedCategoryFilter)
    .filter(textSearchFilter)

  return (
    <div className="appstore animated fadeIn">
      <section className="appstore__warning section">
        {warning && <WarningBox>{warning}</WarningBox>}
      </section>

      <Card>
        <CardHeader className="appstore__header">
          <div className="title__container">
            <CardTitle>Apps & Plugins</CardTitle>
            <div className="button-wrapper">
              <Button
                color={view === 'All' ? 'primary' : 'secondary'}
                onClick={() => setSelectedView('All')}
              >
                All
              </Button>
              <Button
                color={view === 'Installed' ? 'primary' : 'secondary'}
                onClick={() => setSelectedView('Installed')}
              >
                Installed
              </Button>
              <Button
                color={view === 'Updates' ? 'primary' : 'secondary'}
                onClick={() => setSelectedView('Updates')}
              >
                Updates
                {props.appStore.updates.length > 0 && (
                  <span className="badge__update">
                    {props.appStore.updates.length}
                  </span>
                )}
              </Button>
            </div>
          </div>

          <div className="action__container">
            {view == 'Updates' && props.appStore.updates.length > 0 ? (
              <Button color="success" onClick={handleUpdateAll}>
                Update all
              </Button>
            ) : undefined}

            <div className="search">
              <FontAwesomeIcon
                className="search__icon"
                icon={faMagnifyingGlass}
              />
              <Input
                id="search-text-box"
                className="search__input"
                placeholder="Search ..."
                onInput={(e) => {
                  setSearch(e.target.value)
                }}
                value={search}
              />
            </div>
          </div>
        </CardHeader>

        <CardBody>
          <section className="appstore__tags section">
            {props.appStore.categories?.map((item) => (
              <Button
                key={item}
                color="primary"
                className={category === item ? 'active' : undefined}
                outline
                onClick={() => setSelectedCategory(item)}
              >
                {item}
              </Button>
            ))}
          </section>
          <section className="appstore__grid">
            <div style={{ height: '100%' }}>
              <AppsList apps={rowData} />
            </div>
          </section>
        </CardBody>
      </Card>
    </div>
  )
}

const selectedViewToFilter = (selectedView, appStore) => {
  if (selectedView === 'Installed') {
    return (app) => app.installing || app.installedVersion
  } else if (selectedView === 'Updates') {
    return (app) =>
      app.installedVersion &&
      app.version !== app.installedVersion &&
      appStore.updates.find((update) => update.name === app.name)
  }
  return () => true
}

const mapStateToProps = ({ appStore }) => ({ appStore })
export default connect(mapStateToProps)(Apps)
