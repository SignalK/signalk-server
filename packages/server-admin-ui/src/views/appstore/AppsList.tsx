import { useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import type { AppInfo } from '../../store/types'
import PluginCard from './components/PluginCard'
import PluginRow from './components/PluginRow'

export type AppData = AppInfo

export type AppsViewMode = 'grid' | 'list'

interface AppListProps {
  apps: AppData[]
  viewMode?: AppsViewMode
}

export default function AppList({
  apps: propsApps,
  viewMode = 'list'
}: AppListProps) {
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

  if (viewMode === 'grid') {
    return (
      <InfiniteScroll
        dataLength={apps.length}
        next={loadMore}
        hasMore={apps.length !== propsApps.length}
        loader={null}
        style={{ overflow: 'visible' }}
      >
        <Row className="g-3">
          {apps.map((app) => (
            <Col key={app.name} xs={12} md={6} xl={4}>
              <PluginCard app={app} />
            </Col>
          ))}
        </Row>
      </InfiniteScroll>
    )
  }

  return (
    <InfiniteScroll
      dataLength={apps.length}
      next={loadMore}
      hasMore={apps.length !== propsApps.length}
      loader={null}
      style={{ overflow: 'visible' }}
    >
      <div className="plugin-list">
        {apps.map((app) => (
          <PluginRow key={app.name} app={app} />
        ))}
      </div>
    </InfiniteScroll>
  )
}
