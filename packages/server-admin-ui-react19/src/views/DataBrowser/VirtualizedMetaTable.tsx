import { memo } from 'react'
import Meta from './Meta'
import { useMetaData } from './usePathData'
import './VirtualTable.css'

interface MetaRowProps {
  path: string
  ctx: string
  index: number
  gridColumns: string
  showContext: boolean
}

const MetaRow = memo(function MetaRow({
  path,
  ctx,
  index,
  gridColumns,
  showContext
}: MetaRowProps) {
  const meta = useMetaData(ctx, path)
  return (
    <div
      className={`virtual-table-row virtual-table-meta-row ${index % 2 ? 'striped' : ''}`}
      style={{ gridTemplateColumns: gridColumns }}
    >
      <div className="virtual-table-cell">{path}</div>
      {showContext && <div className="virtual-table-cell">{ctx}</div>}
      <div className="virtual-table-cell">
        {!path.startsWith('notifications') && (
          <Meta meta={meta || {}} path={path} context={ctx} />
        )}
      </div>
    </div>
  )
})

interface VirtualizedMetaTableProps {
  paths: string[]
  context: string
  showContext?: boolean
}

// Renders all rows; content-visibility: auto (in CSS) handles off-screen skipping.
// Variable row heights make spacer-based virtualization impractical here.
function VirtualizedMetaTable({
  paths,
  context,
  showContext = false
}: VirtualizedMetaTableProps) {
  if (paths.length === 0) {
    return (
      <div className="virtual-table">
        <div className="virtual-table-info">No metadata available</div>
      </div>
    )
  }

  const gridColumns = showContext
    ? 'minmax(200px, 1fr) minmax(100px, 0.5fr) minmax(300px, 2fr)'
    : 'minmax(200px, 1fr) minmax(300px, 2fr)'

  return (
    <div className="virtual-table virtual-table-meta">
      <div
        className="virtual-table-header"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <div className="virtual-table-header-cell">Path</div>
        {showContext && (
          <div className="virtual-table-header-cell">Context</div>
        )}
        <div className="virtual-table-header-cell">Meta</div>
      </div>

      <div className="virtual-table-body">
        {paths.map((item, i) => {
          const separatorIndex = item.indexOf('\0')
          const ctx =
            separatorIndex !== -1 ? item.slice(0, separatorIndex) : context
          const path =
            separatorIndex !== -1 ? item.slice(separatorIndex + 1) : item
          return (
            <MetaRow
              key={item}
              path={path}
              ctx={ctx}
              index={i}
              gridColumns={gridColumns}
              showContext={showContext}
            />
          )
        })}
      </div>

      <div className="virtual-table-info">Showing {paths.length} paths</div>
    </div>
  )
}

export default VirtualizedMetaTable
