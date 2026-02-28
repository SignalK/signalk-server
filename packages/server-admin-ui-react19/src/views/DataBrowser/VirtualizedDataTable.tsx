import { useEffect, useMemo } from 'react'
import DataRow from './DataRow'
import { getPathFromKey } from './pathUtils'
import granularSubscriptionManager from './GranularSubscriptionManager'
import type { SourcesData } from '../../utils/sourceLabels'
import './VirtualTable.css'

interface VirtualizedDataTableProps {
  path$SourceKeys: string[]
  context: string
  raw: boolean
  isPaused: boolean
  showContext: boolean
  sourcesData: SourcesData | null
  configuredPriorityPaths: Set<string>
}

function VirtualizedDataTable({
  path$SourceKeys,
  context,
  raw,
  isPaused,
  showContext,
  sourcesData,
  configuredPriorityPaths
}: VirtualizedDataTableProps) {
  const sourceCountsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const key of path$SourceKeys) {
      // In "all" context mode keys are "context\0path$source" — strip prefix
      const nullIdx = key.indexOf('\0')
      const pathKey = nullIdx >= 0 ? key.slice(nullIdx + 1) : key
      const path = getPathFromKey(pathKey)
      counts.set(path, (counts.get(path) || 0) + 1)
    }
    return counts
  }, [path$SourceKeys])

  // Subscribe to all paths at once
  useEffect(() => {
    if (isPaused) return
    if (path$SourceKeys.length === 0) return

    granularSubscriptionManager.requestPaths(path$SourceKeys, path$SourceKeys)
  }, [path$SourceKeys, isPaused])

  if (path$SourceKeys.length === 0) {
    return (
      <div className="virtual-table">
        <div className="virtual-table-info">
          No data available. Waiting for data...
        </div>
      </div>
    )
  }

  return (
    <div
      className="virtual-table"
      data-show-context={showContext ? 'true' : undefined}
    >
      <div className="virtual-table-header">
        <div className="virtual-table-header-cell">Path</div>
        {showContext && (
          <div className="virtual-table-header-cell">Context</div>
        )}
        <div className="virtual-table-header-cell">Value</div>
        <div className="virtual-table-header-cell">Timestamp</div>
        <div className="virtual-table-header-cell">Source</div>
      </div>

      <div className="virtual-table-body">
        {path$SourceKeys.map((key, index) => (
          <DataRow
            key={key}
            path$SourceKey={key}
            context={context}
            index={index}
            raw={raw}
            isPaused={isPaused}
            showContext={showContext}
            sourceCountsByPath={sourceCountsByPath}
            sourcesData={sourcesData}
            configuredPriorityPaths={configuredPriorityPaths}
          />
        ))}
      </div>

      <div className="virtual-table-info">
        Showing {path$SourceKeys.length} paths
      </div>
    </div>
  )
}

export default VirtualizedDataTable
