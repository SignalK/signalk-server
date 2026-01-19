import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Meta from './Meta'
import store from './ValueEmittingStore'
import './VirtualTable.css'

interface VirtualizedMetaTableProps {
  paths: string[]
  context: string
}

function VirtualizedMetaTable({ paths, context }: VirtualizedMetaTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 30 })
  const rowHeight = 60 // Meta rows are taller due to form elements
  const overscan = 10

  const updateVisibleRange = useCallback(() => {
    if (!containerRef.current) return

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

    setVisibleRange((prev) => {
      if (
        Math.abs(prev.start - startIndex) > 2 ||
        Math.abs(prev.end - endIndex) > 2
      ) {
        return { start: startIndex, end: endIndex }
      }
      return prev
    })
  }, [paths.length, rowHeight, overscan])

  useEffect(() => {
    updateVisibleRange()

    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          updateVisibleRange()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [updateVisibleRange])

  useEffect(() => {
    updateVisibleRange()
  }, [paths, updateVisibleRange])

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
          const meta = store.getMeta(context, item.path) || {}
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
