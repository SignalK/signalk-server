import React, { useState, useCallback, useRef, useEffect } from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardTitle,
  CardHeader,
  CardBody,
  Button,
  Input,
} from 'reactstrap'
import { AgGridReact } from 'ag-grid-react' // React Grid Logic
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'

/* Javascript files */
import columnDefs from '../Grid/columnDefs'

/* Components */
import WarningBox from './WarningBox'

/* Styling */
import '../appStore.scss'

/** Main component */
const Apps = function (props) {
  /** State */
  const [selectedView, setSelectedView] = useState('All')
  const [selectedTag, setSelectedTag] = useState('All')

  /* Effects / Watchers */
  useEffect(() => {
    const handleResize = () => {
      // Perform actions on window resize
      toggleColumnsOnMobile(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (selectedView === 'All') {
      refreshGridData(selectedTag, deriveAppList())
    } else if (selectedView === 'Installed') {
      refreshGridData(
        selectedTag,
        deriveAppList().filter((el) => el.installedVersion || el.installing)
      )
    } else if (selectedView === 'Updates') {
      refreshGridData(
        selectedTag,
        deriveAppList().filter(
          (el) => el.installedVersion && el.version !== el.installedVersion
        )
      )
    }
    return () => {}
  }, [
    selectedTag,
    selectedView,
    props.appStore.installed,
    props.appStore.available,
  ])

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
          newVersion: app.installedVersion !== app.version ? app.version : null,
        })
    )
    props.appStore.installing.forEach(
      (app) => (allApps[app.name].installing = true)
    )
    return Object.values(allApps)
  }

  /** Grid Element */
  const gridRef = useRef()
  const [rowData, setRowData] = useState(() => deriveAppList())

  const autoSizeStrategy = {
    type: 'fitGridWidth',
    defaultMinWidth: 100,
    columnLimits: [],
  }

  /** Methods */
  const onSearchTextBoxChanged = useCallback(() => {
    gridRef.current.api.setGridOption(
      'quickFilterText',
      document.getElementById('search-text-box').value
    )
  }, [])

  /**
   * Set the rowData with the filter selected
   */
  const refreshGridData = useCallback((item, gridData) => {
    if (!item || item === 'All') return setRowData(gridData)
    let newData = []
    newData = gridData.filter((el) => el.categories.includes(item))
    setRowData(newData)
  })

  /** Hide columns if widow is small than a threshold */
  const toggleColumnsOnMobile = (innerWidth) => {
    gridRef.current.api.applyColumnState({
      state: [
        { colId: 'description', hide: innerWidth < 768 },
        { colId: 'author', hide: innerWidth < 991 },
        { colId: 'type', hide: innerWidth < 1024 },
      ],
    })
  }

  /** Callback called when the grid is ready */
  const onGridReady = useCallback((params) => {
    window.addEventListener('resize', () => {
      setTimeout(() => {
        params.api.sizeColumnsToFit()
      })
    })
  }, [])

  const handleUpdateAll = () => {
    if (confirm(`Are you sure you want to install all updates?`)) {
      // Iterate over all apps to be updated
      for (const app of rowData) {
        if (app.updateAvailable && app.installed) {
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
  whether if the store is available or if an app was installed or removed
  */
  let warning
  if (props.appStore.storeAvailable === false) {
    warning = `You probably don't have Internet connectivity and Appstore can not be reached.`
  } else if (props.appStore.installing.length > 0) {
    warning =
      'Please restart the server after installing, updating or deleting a plugin'
  }

  return (
    <div className="appstore animated fadeIn">
      <section className="appstore__warning section">
        {warning && <WarningBox>{warning}</WarningBox>}
      </section>

      <Card>
        <CardHeader className="appstore__header">
          <div className="title__container">
            <CardTitle>Apps & Plugins</CardTitle>
            {/* <h3 className="title"></h3> */}
            <Button
              color={selectedView === 'All' ? 'primary' : 'secondary'}
              onClick={() => setSelectedView('All')}
            >
              All
            </Button>
            <Button
              color={selectedView === 'Installed' ? 'primary' : 'secondary'}
              onClick={() => setSelectedView('Installed')}
            >
              Installed
            </Button>
            <Button
              color={selectedView === 'Updates' ? 'primary' : 'secondary'}
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

          <div className="action__container">
            {selectedView == 'Updates' && props.appStore.updates.length > 0 ? (
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
                onInput={onSearchTextBoxChanged}
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
                className={selectedTag === item ? 'active' : undefined}
                outline
                onClick={() => setSelectedTag(item)}
              >
                {item}
              </Button>
            ))}
          </section>
          <section className="appstore__grid section">
            <div
              className="ag-theme-quartz ag-theme-signalk"
              style={{ height: '100%' }}
            >
              <AgGridReact
                ref={gridRef}
                rowData={rowData}
                columnDefs={columnDefs}
                autoSizeStrategy={autoSizeStrategy}
                onGridReady={onGridReady}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </section>
        </CardBody>
      </Card>
    </div>
  )
}

const mapStateToProps = ({ appStore }) => ({ appStore })
export default connect(mapStateToProps)(Apps)
