import React, { useEffect, useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import { ListGroup, ListGroupItem } from 'reactstrap'
import ActionCellRenderer from './Grid/cell-renderers/ActionCellRenderer'

export function AppListItem(app) {
  return (
    <ListGroupItem className="p-3">
      <div className="d-md-flex align-items-center flex-grow-1">
        <div className="flex-grow-1 mr-3">
          <h5 className="text-dark mb-0">{app.name}</h5>
          <div className="text-muted">
            <span className="font-weight-bolder">
              v{app.installedVersion || app.version}{' '}
            </span>
            {app.newVersion && (
              <>
                <span className="text-secondary"> → </span>
                <span className="font-weight-bolder text-success font-italic">
                  v{app.newVersion}
                </span>{' '}
              </>
            )}
            released by
            <span className="text-nowrap font-weight-bolder">
              {' '}
              {app.author}
            </span>{' '}
            on
            <span className="text-nowrap"> {app.updated.substring(0, 10)}</span>
          </div>
          <p className="text-pretty mb-0">{app.description}</p>
        </div>
        <div className="mt-3 mt-md-0">
          <ActionCellRenderer data={app} />
        </div>
      </div>
    </ListGroupItem>
  )
}

export default function AppList(props) {
  const [apps, setApps] = useState([])

  function loadMore() {
    setApps(props.apps.slice(0, apps.length + 20))
  }

  // Load initial list of apps
  useEffect(loadMore, [props.apps])

  return (
    <ListGroup>
      <InfiniteScroll
        dataLength={apps.length}
        next={loadMore}
        hasMore={apps.length != props.apps.length}
      >
        {apps.map((app) => (
          <AppListItem key={app.name} {...app} />
        ))}
      </InfiniteScroll>
    </ListGroup>
  )
}
