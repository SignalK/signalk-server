import { useEffect, useMemo, useRef } from 'react'
import DataRow from './DataRow'
import SourceGroupHeader from './SourceGroupHeader'
import { getPathFromKey } from './pathUtils'
import granularSubscriptionManager from './GranularSubscriptionManager'
import type { SourcesData } from '../../utils/sourceLabels'
import './VirtualTable.css'

const HEADER_PREFIX = '__header__\0'

interface VirtualizedDataTableProps {
  path$SourceKeys: string[]
  context: string
  raw: boolean
  isPaused: boolean
  showContext: boolean
  /**
   * True when the user is in 'Priority filtered' mode. The X/Y badge in
   * DataRow renders differently per mode: informational in 'All sources',
   * a "needs configuration" warning in 'Priority filtered'.
   */
  sourceFilter: boolean
  sourcesData: SourcesData | null
  configuredPriorityPaths: Set<string>
  routedPaths?: Set<string>
  preferredSourceByPath?: Map<string, string>
  fanOutPaths?: Set<string>
  collapsedSources?: Set<string>
  onToggleSourceCollapse?: (sourceRef: string) => void
}

function VirtualizedDataTable({
  path$SourceKeys,
  context,
  raw,
  isPaused,
  showContext,
  sourceFilter,
  sourcesData,
  configuredPriorityPaths,
  routedPaths,
  preferredSourceByPath,
  fanOutPaths,
  collapsedSources,
  onToggleSourceCollapse
}: VirtualizedDataTableProps) {
  // Count per (context, path) rather than per path. In ALL mode a path
  // can have rows from multiple vessels and counting them together
  // misreports the per-vessel source count — e.g. a self-vessel
  // navigation.position with one local source plus six AIS targets
  // would otherwise read as "1/7" on the self row even though there's
  // no local-source contention. The key matches the keying used by
  // `filtered` upstream so DataRow can rebuild it for lookup.
  const sourceCountsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const key of path$SourceKeys) {
      if (key.startsWith(HEADER_PREFIX)) continue
      const nullIdx = key.indexOf('\0')
      const ctx = nullIdx >= 0 ? key.slice(0, nullIdx) : ''
      const pathKey = nullIdx >= 0 ? key.slice(nullIdx + 1) : key
      const path = getPathFromKey(pathKey)
      const countKey = ctx ? `${ctx}\0${path}` : path
      counts.set(countKey, (counts.get(countKey) || 0) + 1)
    }
    return counts
  }, [path$SourceKeys])

  const dataKeys = useMemo(
    () => path$SourceKeys.filter((k) => !k.startsWith(HEADER_PREFIX)),
    [path$SourceKeys]
  )

  // Track whether the table has ever seen data. Without this, an initial
  // render with dataKeys=[] would immediately unsubscribe and the very
  // first delta for a path would never arrive. We only pass an empty list
  // through after we've had at least one non-empty request — meaning the
  // user genuinely filtered every path out.
  const hadDataRef = useRef(false)

  useEffect(() => {
    if (isPaused) return
    if (dataKeys.length > 0) {
      hadDataRef.current = true
      granularSubscriptionManager.requestPaths(dataKeys)
    } else if (hadDataRef.current) {
      granularSubscriptionManager.requestPaths([])
    }
  }, [dataKeys, isPaused])

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
        {path$SourceKeys.map((key, index) => {
          if (key.startsWith(HEADER_PREFIX)) {
            const rest = key.slice(HEADER_PREFIX.length)
            const sepIdx = rest.indexOf('\0')
            const sourceRef = sepIdx >= 0 ? rest.slice(0, sepIdx) : rest
            const pathCount =
              sepIdx >= 0 ? parseInt(rest.slice(sepIdx + 1), 10) || 0 : 0
            return (
              <SourceGroupHeader
                key={key}
                sourceRef={sourceRef}
                pathCount={pathCount}
                sourcesData={sourcesData}
                showContext={showContext}
                isCollapsed={collapsedSources?.has(sourceRef) ?? false}
                onToggle={onToggleSourceCollapse}
              />
            )
          }
          return (
            <DataRow
              key={key}
              path$SourceKey={key}
              context={context}
              index={index}
              raw={raw}
              isPaused={isPaused}
              showContext={showContext}
              sourceFilter={sourceFilter}
              sourceCountsByPath={sourceCountsByPath}
              sourcesData={sourcesData}
              configuredPriorityPaths={configuredPriorityPaths}
              routedPaths={routedPaths}
              preferredSourceByPath={preferredSourceByPath}
              fanOutPaths={fanOutPaths}
            />
          )
        })}
      </div>

      <div className="virtual-table-info">Showing {dataKeys.length} paths</div>
    </div>
  )
}

export default VirtualizedDataTable
