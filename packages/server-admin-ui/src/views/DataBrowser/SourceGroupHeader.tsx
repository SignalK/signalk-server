import type { KeyboardEvent } from 'react'
import Badge from 'react-bootstrap/Badge'
import SourceLabel from './SourceLabel'
import type { SourcesData } from '../../utils/sourceLabels'

interface SourceGroupHeaderProps {
  sourceRef: string
  pathCount: number
  sourcesData: SourcesData | null
  showContext: boolean
  isCollapsed: boolean
  onToggle?: (sourceRef: string) => void
}

function SourceGroupHeader({
  sourceRef,
  pathCount,
  sourcesData,
  showContext,
  isCollapsed,
  onToggle
}: SourceGroupHeaderProps) {
  const colSpan = showContext ? 5 : 4
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onToggle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onToggle(sourceRef)
    }
  }
  return (
    <div
      className="virtual-table-row source-group-header"
      onClick={onToggle ? () => onToggle(sourceRef) : undefined}
      onKeyDown={onToggle ? handleKeyDown : undefined}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-expanded={onToggle ? !isCollapsed : undefined}
      aria-label={
        onToggle
          ? `${isCollapsed ? 'Expand' : 'Collapse'} ${sourceRef} group with ${pathCount} path${pathCount === 1 ? '' : 's'}`
          : undefined
      }
      style={{
        gridColumn: `1 / span ${colSpan}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        backgroundColor: 'var(--bs-secondary-bg, #e2e6ea)',
        borderBottom: '2px solid var(--bs-border-color, #c2cfd6)',
        borderTop: '1px solid var(--bs-border-color, #c2cfd6)',
        fontWeight: 700,
        fontSize: '1rem',
        cursor: onToggle ? 'pointer' : undefined,
        userSelect: 'none'
      }}
    >
      {onToggle && (
        <span
          aria-hidden="true"
          style={{ width: '16px', textAlign: 'center', fontSize: '0.8em' }}
        >
          {isCollapsed ? '\u25B6' : '\u25BC'}
        </span>
      )}
      <SourceLabel sourceRef={sourceRef} sourcesData={sourcesData} />
      <Badge bg="secondary" style={{ fontSize: '0.7em', fontWeight: 'normal' }}>
        {pathCount}
      </Badge>
    </div>
  )
}

export default SourceGroupHeader
