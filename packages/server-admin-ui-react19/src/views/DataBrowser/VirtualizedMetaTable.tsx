import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Meta from './Meta'
import { useStore, useShallow } from '../../store'
import './VirtualTable.css'

interface VirtualizedMetaTableProps {
  paths: string[]
  context: string
}

function VirtualizedMetaTable({ paths, context }: VirtualizedMetaTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contextMeta = useStore(useShallow((s) => s.signalkMeta[context] || {}))
  const rowHeight = 60
  const overscan = 10
  const [pathsLength, setPathsLength] = useState(paths.length)

  // Compute initial visible range synchronously for first render
  const computeInitialRange = useCallback(() => {
    const visibleCount =
      Math.ceil(window.innerHeight / rowHeight) + overscan * 2
    return { start: 0, end: Math.min(paths.length - 1, visibleCount) }
  }, [paths.length, rowHeight, overscan])

  const [visibleRange, setVisibleRange] = useState(computeInitialRange)

  // Reset visible range when paths length changes
  if (paths.length !== pathsLength) {
    setPathsLength(paths.length)
    setVisibleRange(computeInitialRange())
  }

  // Computes new visible range from DOM measurements
  const computeVisibleRange = useCallback((): {
    start: number
    end: number
  } | null => {
    if (!containerRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const containerTop = rect.top
    const viewportHeight = window.innerHeight

    let startOffset = 0
    if (containerTop < 0) {
      startOffset = Math.abs(containerTop)
    }

    const startIndex = Math.max(
      0,
      Math.floor(startOffset / rowHeight) - overscan
    )
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
    const endIndex = Math.min(paths.length - 1, startIndex + visibleCount)

    return { start: startIndex, end: endIndex }
  }, [paths.length, rowHeight, overscan])

  useEffect(() => {
    let ticking = false

    // Handler for scroll/resize events - updates state when range changes significantly
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const newRange = computeVisibleRange()
          if (newRange) {
            setVisibleRange((prev) => {
              if (
                Math.abs(prev.start - newRange.start) > 2 ||
                Math.abs(prev.end - newRange.end) > 2
              ) {
                return newRange
              }
              return prev
            })
          }
          ticking = false
        })
        ticking = true
      }
    }

    // Trigger initial measurement after mount via scroll event simulation
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [computeVisibleRange])

  const visibleItems = useMemo(() => {
    const end = Math.min(visibleRange.end + 1, paths.length)
    return paths.slice(visibleRange.start, end).map((path, i) => ({
      index: visibleRange.start + i,
      path
    }))
  }, [visibleRange.start, visibleRange.end, paths])

  const spacerBeforeHeight = visibleRange.start * rowHeight
  const spacerAfterHeight = Math.max(
    0,
    (paths.length - visibleRange.end - 1) * rowHeight
  )

  if (paths.length === 0) {
    return (
      <div className="virtual-table">
        <div className="virtual-table-info">No metadata available</div>
      </div>
    )
  }

  return (
    <div className="virtual-table virtual-table-meta" ref={containerRef}>
      <div
        className="virtual-table-header"
        style={{ gridTemplateColumns: 'minmax(200px, 1fr) minmax(300px, 2fr)' }}
      >
        <div className="virtual-table-header-cell">Path</div>
        <div className="virtual-table-header-cell">Meta</div>
      </div>

      <div className="virtual-table-body">
        {spacerBeforeHeight > 0 && (
          <div style={{ height: spacerBeforeHeight }} />
        )}

        {visibleItems.map((item) => {
          const meta = contextMeta[item.path] || {}
          return (
            <div
              key={item.path}
              className={`virtual-table-row ${item.index % 2 ? 'striped' : ''}`}
              style={{
                gridTemplateColumns: 'minmax(200px, 1fr) minmax(300px, 2fr)',
                minHeight: rowHeight
              }}
            >
              <div className="virtual-table-cell">{item.path}</div>
              <div className="virtual-table-cell">
                {!item.path.startsWith('notifications') && (
                  <Meta meta={meta} path={item.path} />
                )}
              </div>
            </div>
          )
        })}

        {spacerAfterHeight > 0 && <div style={{ height: spacerAfterHeight }} />}
      </div>

      <div className="virtual-table-info">
        Showing {visibleItems.length} of {paths.length} paths
      </div>
    </div>
  )
}

export default VirtualizedMetaTable
