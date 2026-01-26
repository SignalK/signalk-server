import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ChangeEvent
} from 'react'
import DataRow from './DataRow'
import granularSubscriptionManager from './GranularSubscriptionManager'
import './VirtualTable.css'

interface VisibleItem {
  index: number
  path$SourceKey: string
}

interface VirtualizedDataTableProps {
  path$SourceKeys: string[]
  context: string
  raw: boolean
  isPaused: boolean
  onToggleSource: (source: string) => void
  selectedSources: Set<string>
  onToggleSourceFilter: (event: ChangeEvent<HTMLInputElement>) => void
  sourceFilterActive: boolean
}

/**
 * VirtualizedDataTable - Window-scroll virtualized table
 * Optimized for React 19 with dynamic row heights for RAW mode
 */
// Virtualization requires measuring DOM and updating state in response to scroll events.
// This is an inherent characteristic of virtual scrolling - we must read the container's
// position from the DOM (via refs) and update which rows are rendered (via state).
function VirtualizedDataTable({
  path$SourceKeys,
  context,
  raw,
  isPaused,
  onToggleSource,
  selectedSources,
  onToggleSourceFilter,
  sourceFilterActive
}: VirtualizedDataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Track path$SourceKeys.length to reset range when data changes
  const [keysLength, setKeysLength] = useState(path$SourceKeys.length)
  const [isNarrowScreen, setIsNarrowScreen] = useState(
    typeof window !== 'undefined' && window.innerWidth <= 768
  )

  // Row height estimates: stacked mobile layout is taller than grid layout
  const rowHeight = isNarrowScreen ? 120 : 40
  const overscan = isNarrowScreen ? 5 : 15

  // Compute initial visible range synchronously for first render
  const computeInitialRange = useCallback(() => {
    const visibleCount =
      Math.ceil(window.innerHeight / rowHeight) + overscan * 2
    return { start: 0, end: Math.min(path$SourceKeys.length - 1, visibleCount) }
  }, [path$SourceKeys.length, rowHeight, overscan])

  const [visibleRange, setVisibleRange] = useState(computeInitialRange)

  // Reset visible range when path$SourceKeys length changes
  if (path$SourceKeys.length !== keysLength) {
    setKeysLength(path$SourceKeys.length)
    setVisibleRange(computeInitialRange())
  }

  // Track screen width for mobile layout detection
  useEffect(() => {
    const checkWidth = () => setIsNarrowScreen(window.innerWidth <= 768)
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  // Compute visible range from DOM measurements
  const computeVisibleRange = useCallback(() => {
    if (!containerRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const containerTop = rect.top
    const viewportHeight = window.innerHeight

    // Calculate which rows are visible
    let startOffset = 0
    if (containerTop < 0) {
      startOffset = Math.abs(containerTop)
    }

    const startIndex = Math.max(
      0,
      Math.floor(startOffset / rowHeight) - overscan
    )
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
    const endIndex = Math.min(
      path$SourceKeys.length - 1,
      startIndex + visibleCount
    )

    return { start: startIndex, end: endIndex, visibleCount }
  }, [path$SourceKeys.length, rowHeight, overscan])

  // Set up scroll listener
  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const computed = computeVisibleRange()
          if (computed) {
            setVisibleRange((prev) => {
              // Only update if range actually changed to avoid excessive re-renders
              const atStart = computed.start === 0
              const atEnd = computed.end >= path$SourceKeys.length - 1
              const significantChange =
                Math.abs(prev.start - computed.start) > 2 ||
                Math.abs(prev.end - computed.end) > 2
              const listGrew =
                prev.end < computed.end &&
                prev.end === prev.start + computed.visibleCount - 1

              if (atStart || atEnd || significantChange || listGrew) {
                return { start: computed.start, end: computed.end }
              }
              return prev
            })
          }
          ticking = false
        })
        ticking = true
      }
    }

    // Trigger initial measurement
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [computeVisibleRange, path$SourceKeys.length])

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      granularSubscriptionManager.unsubscribeAll()
    }
  }, [])

  // Handle pause/unpause
  useEffect(() => {
    if (isPaused) {
      granularSubscriptionManager.unsubscribeAll()
    }
  }, [isPaused])

  const spacerBeforeHeight = visibleRange.start * rowHeight
  const spacerAfterHeight = Math.max(
    0,
    (path$SourceKeys.length - visibleRange.end - 1) * rowHeight
  )

  const visibleItems: VisibleItem[] = useMemo(() => {
    const end = Math.min(visibleRange.end + 1, path$SourceKeys.length)
    return path$SourceKeys
      .slice(visibleRange.start, end)
      .map((path$SourceKey, i) => ({
        index: visibleRange.start + i,
        path$SourceKey
      }))
  }, [visibleRange.start, visibleRange.end, path$SourceKeys])

  // Report visible paths to granular subscription manager
  // Must be after visibleItems useMemo since it depends on it
  useEffect(() => {
    if (isPaused) return
    if (visibleItems.length === 0) return

    const visiblePath$SourceKeys = visibleItems.map(
      (item) => item.path$SourceKey
    )
    granularSubscriptionManager.requestPaths(
      visiblePath$SourceKeys,
      path$SourceKeys
    )
  }, [
    visibleRange.start,
    visibleRange.end,
    path$SourceKeys,
    isPaused,
    visibleItems
  ])

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
    <div className="virtual-table" ref={containerRef}>
      {/* Header */}
      <div className="virtual-table-header">
        <div className="virtual-table-header-cell">Path</div>
        <div className="virtual-table-header-cell">Value</div>
        <div className="virtual-table-header-cell">Timestamp</div>
        <div className="virtual-table-header-cell">
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              margin: 0,
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              onChange={onToggleSourceFilter}
              checked={sourceFilterActive}
              disabled={selectedSources.size === 0}
              title={
                selectedSources.size === 0
                  ? 'Check a source in the list to filter by source'
                  : sourceFilterActive
                    ? 'Uncheck to deactivate source filtering'
                    : 'Check to activate source filtering'
              }
              style={{
                marginRight: '5px',
                verticalAlign: 'middle'
              }}
            />
            Source
          </label>
        </div>
      </div>

      {/* Virtualized Body - using spacers instead of absolute positioning */}
      <div className="virtual-table-body">
        {/* Spacer for rows above visible range */}
        {spacerBeforeHeight > 0 && (
          <div style={{ height: spacerBeforeHeight }} />
        )}

        {/* Visible rows - rendered in normal flow for variable heights */}
        {visibleItems.map((item) => (
          <DataRow
            key={item.path$SourceKey}
            path$SourceKey={item.path$SourceKey}
            context={context}
            index={item.index}
            raw={raw}
            isPaused={isPaused}
            onToggleSource={onToggleSource}
            selectedSources={selectedSources}
          />
        ))}

        {/* Spacer for rows below visible range */}
        {spacerAfterHeight > 0 && <div style={{ height: spacerAfterHeight }} />}
      </div>

      <div className="virtual-table-info">
        Showing {visibleItems.length} of {path$SourceKeys.length} paths (rows{' '}
        {visibleRange.start + 1}-
        {Math.min(visibleRange.end + 1, path$SourceKeys.length)})
      </div>
    </div>
  )
}

export default VirtualizedDataTable
