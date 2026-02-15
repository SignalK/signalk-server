import { useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import { ListGroup, ListGroupItem } from 'reactstrap'
import ActionCellRenderer from './Grid/cell-renderers/ActionCellRenderer'

export interface AppData {
  name: string
  version?: string
  installedVersion?: string
  newVersion?: string
  prereleaseVersion?: string
  author?: string
  updated?: string
  description?: string
  [key: string]: unknown
}

export function AppListItem(app: AppData) {
  return (
    <ListGroupItem className="p-3">
      <div className="d-md-flex align-items-center flex-grow-1">
        <div className="flex-grow-1 me-3">
          <h5 className="text-dark mb-0">{app.name}</h5>
          <div className="text-muted">
            <span className="fw-bold">
              v{app.installedVersion || app.version}{' '}
            </span>
            {app.newVersion && (
              <>
                <span className="text-secondary"> → </span>
                <span className="fw-bold text-success fst-italic">
                  v{app.newVersion}
                </span>{' '}
              </>
            )}
            released by
            <span className="text-nowrap fw-bold"> {app.author}</span> on
            <span className="text-nowrap">
              {' '}
              {app.updated?.substring(0, 10)}
            </span>
            {app.prereleaseVersion && (
              <span className="badge text-bg-info ms-2">
                pre-release: v{app.prereleaseVersion}
              </span>
            )}
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

interface AppListProps {
  apps: AppData[]
}

export default function AppList({ apps: propsApps }: AppListProps) {
  const [displayCount, setDisplayCount] = useState(20)
  const [prevAppsLength, setPrevAppsLength] = useState(propsApps.length)

  if (propsApps.length !== prevAppsLength) {
    setPrevAppsLength(propsApps.length)
    setDisplayCount(20)
  }

  const apps = propsApps.slice(0, displayCount)

  function loadMore() {
    setDisplayCount((prev) => prev + 20)
  }

  return (
    <ListGroup>
      <InfiniteScroll
        dataLength={apps.length}
        next={loadMore}
        hasMore={apps.length !== propsApps.length}
        loader={null}
      >
        {apps.map((app) => (
          <AppListItem key={app.name} {...app} />
        ))}
      </InfiniteScroll>
    </ListGroup>
  )
}
