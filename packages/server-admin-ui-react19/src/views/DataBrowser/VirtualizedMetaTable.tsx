import { memo } from 'react'
import Meta from './Meta'
import { useMetaData } from './usePathData'
import './VirtualTable.css'

interface MetaRowProps {
  path: string
  ctx: string
  index: number
  showContext: boolean
}

const MetaRow = memo(function MetaRow({
  path,
  ctx,
  index,
  showContext
}: MetaRowProps) {
  const meta = useMetaData(ctx, path)
  if (path.startsWith('notifications')) return null
  return (
    <div
      className={`virtual-table-meta-row ${index % 2 ? 'striped' : ''}`}
      style={{ padding: '0 2px' }}
    >
      <Meta
        meta={meta || {}}
        path={showContext ? `${ctx}: ${path}` : path}
        context={ctx}
      />
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

  return (
    <div style={{ marginTop: '10px' }}>
      <h6 className="text-muted mb-2">Path Metadata</h6>
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
            showContext={showContext}
          />
        )
      })}
      <div className="text-muted small mt-2">Showing {paths.length} paths</div>
    </div>
  )
}

export default VirtualizedMetaTable
