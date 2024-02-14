import React, { useState, useCallback, useRef, useEffect } from 'react'
import { connect } from 'react-redux'
import { Button, Input } from 'reactstrap'
import { AgGridReact } from 'ag-grid-react' // React Grid Logic

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'

import WarningBox from './WarningBox'

/* Cell rendering */
import TypeCellRenderer from '../Grid/TypeCellRenderer'
import NameCellRenderer from '../Grid/NameCellRenderer'
import ActionCellRenderer from '../Grid/ActionCellRenderer'

/* Styling */
import './Apps.scss'
import 'ag-grid-community/styles/ag-grid.css' // Core CSS
import 'ag-grid-community/styles/ag-theme-quartz.css' // Theme

/* FIXME: Temporary simply to code to be replace with data coming from backend */
const tags = [
  'All',
  'AIS',
  'Chart Plotters',
  'Cloud',
  'Digital Switching',
  'Hardware support',
  'Instruments',
  'NMEA 2000',
  'NMEA 0183',
  'Notifications',
  'Utility',
  'Weather',
]

/** Main component */
const Apps = function (props) {
  /** State */
  const [selectedView, setSelectedView] = useState('All')
  const [selectedTag, setSelectedTag] = useState('All')

  /* Effects / Watchers */
  useEffect(() => {
    const handleResize = () => {
      // Perform actions on window resize
      toggleColumnsOnMobile(window.innerWidth < 786)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (selectedView === 'All') {
      refreshGridData(selectedTag, allAppList())
    } else if (selectedView === 'Installed')
      refreshGridData(selectedTag, installedAppList())
    return () => {}
  }, [
    selectedTag,
    selectedView,
    props.appStore.installed,
    props.appStore.available,
  ])

  const allAppList = () => {
    const installedApp = props.appStore.installed.map((app) => ({
      ...app,
      installed: true,
    }))
    const availableApp = props.appStore.available.map((app) => ({
      ...app,
      installed: false,
    }))

    return [...installedApp, ...availableApp]
  }

  const installedAppList = () => {
    const installedApp = props.appStore.installed.map((app) => ({
      ...app,
      installed: true,
    }))

    return [...installedApp]
  }

  /** Grid Element */
  // Column Definitions: Defines & controls grid columns.
  const gridRef = useRef()
  const [colDefs, setColDefs] = useState([
    {
      field: 'name',
      header: 'Name',
      cellRenderer: NameCellRenderer,
      sort: true,
    },
    {
      colId: 'description',
      field: 'description',
      header: 'Description',
      cellClass: 'cell-description',
      wrapText: true,
      sort: false,
    },
    { colId: 'author', field: 'author', header: 'Author', wrapText: true },
    {
      colId: 'type',
      field: 'type',
      header: 'Type',
      cellRenderer: TypeCellRenderer,
      width: 60,
      sort: false,
    },
    {
      field: 'action',
      header: 'Action',
      cellRenderer: ActionCellRenderer,
      width: 60,
      sort: false,
    },
  ])
  const [rowData, setRowData] = useState(() => allAppList())

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

  /** Hide columns if widown is small than a threshold */
  const toggleColumnsOnMobile = (hide) => {
    gridRef.current.api.applyColumnState({
      state: [
        { colId: 'description', hide },
        { colId: 'author', hide },
        { colId: 'type', hide },
      ],
    })
  }

  const onGridReady = () => {
    toggleColumnsOnMobile(window.innerWidth < 786)
  }

  return (
    <div className="appstore animated fadeIn">
      <section className="appstore__warning section">
        <WarningBox>
          Please restart the server after installing or updating a plugin.
        </WarningBox>
      </section>
      <header className="appstore__header">
        <div className="title__container">
          <h3 className="title">Apps & Plugins</h3>
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
        </div>
        <div className="search">
          <FontAwesomeIcon className="search__icon" icon={faMagnifyingGlass} />
          <Input
            id="search-text-box"
            className="search__input"
            placeholder="Search by plugin or App name..."
            onInput={onSearchTextBoxChanged}
          />
        </div>
      </header>

      <section className="appstore__tags section">
        {tags.map((item) => (
          <Button
            key={item}
            className={selectedTag === item ? 'active' : undefined}
            outline
            onClick={() => setSelectedTag(item)}
          >
            {item}
          </Button>
        ))}
      </section>

      <section className="appstore__grid section">
        <div className="ag-theme-quartz" style={{ height: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            rowHeight={100}
            autoSizeStrategy={autoSizeStrategy}
            onGridReady={onGridReady}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </section>
    </div>
  )
}

const mapStateToProps = ({ appStore }) => ({ appStore })
export default connect(mapStateToProps)(Apps)
