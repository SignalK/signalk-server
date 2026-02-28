import React, { useState, useMemo } from 'react'
import Badge from 'react-bootstrap/Badge'
import { useStore } from '../../store'
import type { PathData } from '../../store'
import { type SourcesData } from '../../utils/sourceLabels'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import SourceLabel from './SourceLabel'

interface SourceViewProps {
  context: string
  search: string
  sourcesData: SourcesData | null
}

interface SourceGroup {
  source: string
  label: string
  paths: {
    path: string
    value: unknown
    timestamp: string
    otherSources: string[]
  }[]
}

const getSignalkData = () => useStore.getState().signalkData

const SourceView: React.FC<SourceViewProps> = ({
  context,
  search,
  sourcesData
}) => {
  const dataVersion = useStore((s) => s.dataVersion)
  const { getDisplayName } = useSourceAliases()
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    () => new Set()
  )

  const sourceGroups: SourceGroup[] = useMemo(() => {
    const currentData = dataVersion >= 0 ? getSignalkData() : {}
    const contexts = context === 'all' ? Object.keys(currentData) : [context]

    // Collect all entries, grouping by source
    const bySource = new Map<
      string,
      { path: string; value: unknown; timestamp: string }[]
    >()
    // Track which sources provide each path
    const pathToSources = new Map<string, Set<string>>()

    for (const ctx of contexts) {
      const contextData = currentData[ctx] || {}
      for (const data of Object.values(contextData)) {
        const pathData = data as PathData
        const source = pathData.$source || 'unknown'
        const path = pathData.path || ''

        if (!path) continue
        if (search && path.toLowerCase().indexOf(search.toLowerCase()) === -1) {
          continue
        }

        if (!bySource.has(source)) bySource.set(source, [])
        bySource.get(source)!.push({
          path,
          value: pathData.value,
          timestamp: pathData.timestamp || ''
        })

        if (!pathToSources.has(path)) pathToSources.set(path, new Set())
        pathToSources.get(path)!.add(source)
      }
    }

    // Build groups sorted by label
    const groups: SourceGroup[] = []
    for (const [source, entries] of bySource) {
      const label = getDisplayName(source, sourcesData)
      const paths = entries
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((entry) => {
          const others = pathToSources.get(entry.path) || new Set()
          return {
            ...entry,
            otherSources: [...others].filter((s) => s !== source)
          }
        })
      groups.push({ source, label, paths })
    }

    return groups.sort((a, b) => a.label.localeCompare(b.label))
  }, [context, search, sourcesData, dataVersion, getDisplayName])

  const toggleSource = (source: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) {
        next.delete(source)
      } else {
        next.add(source)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSources(new Set(sourceGroups.map((g) => g.source)))
  }

  const collapseAll = () => {
    setExpandedSources(new Set())
  }

  if (sourceGroups.length === 0) {
    return (
      <div className="virtual-table">
        <div className="virtual-table-info">
          No data available. Waiting for data...
        </div>
      </div>
    )
  }

  return (
    <div className="source-view">
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '8px',
          fontSize: '0.8rem'
        }}
      >
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={expandAll}
        >
          Expand All
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={collapseAll}
        >
          Collapse All
        </button>
        <span style={{ color: 'var(--bs-secondary-color, #6c757d)' }}>
          {sourceGroups.length} sources
        </span>
      </div>

      {sourceGroups.map((group) => {
        const isExpanded = expandedSources.has(group.source)
        return (
          <div
            key={group.source}
            style={{
              border: '1px solid var(--bs-border-color, #c2cfd6)',
              borderRadius: '0.25rem',
              marginBottom: '4px',
              backgroundColor: 'var(--bs-body-bg, #fff)'
            }}
          >
            <div
              onClick={() => toggleSource(group.source)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bs-tertiary-bg, #f0f3f5)',
                borderBottom: isExpanded
                  ? '1px solid var(--bs-border-color, #c2cfd6)'
                  : 'none',
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              <span style={{ width: '16px', textAlign: 'center' }}>
                {isExpanded ? '\u25BC' : '\u25B6'}
              </span>
              <SourceLabel sourceRef={group.source} sourcesData={sourcesData} />
              <Badge
                bg="secondary"
                style={{ fontSize: '0.7em', fontWeight: 'normal' }}
              >
                {group.paths.length} paths
              </Badge>
            </div>

            {isExpanded && (
              <div style={{ fontSize: '0.8rem' }}>
                {group.paths.map((entry) => (
                  <div
                    key={entry.path}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: '8px',
                      padding: '3px 10px 3px 34px',
                      borderBottom:
                        '1px solid var(--bs-border-color-translucent, #e9ecef)'
                    }}
                  >
                    <span>
                      {entry.path}
                      {entry.otherSources.length > 0 && (
                        <span
                          style={{
                            marginLeft: '6px',
                            color: 'var(--bs-secondary-color, #6c757d)',
                            fontSize: '0.85em'
                          }}
                          title={entry.otherSources
                            .map((s) => getDisplayName(s, sourcesData))
                            .join(', ')}
                        >
                          [also:{' '}
                          {entry.otherSources
                            .map((s) => getDisplayName(s, sourcesData))
                            .join(', ')}
                          ]
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        color: 'var(--bs-secondary-color, #6c757d)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {entry.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default SourceView
