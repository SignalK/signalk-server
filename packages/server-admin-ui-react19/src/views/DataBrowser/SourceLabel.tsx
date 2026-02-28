import React, { useState, useRef, useEffect } from 'react'
import { useSourceAliases } from '../../hooks/useSourceAliases'
import type { SourcesData } from '../../utils/sourceLabels'

interface SourceLabelProps {
  sourceRef: string
  sourcesData: SourcesData | null
}

const SourceLabel: React.FC<SourceLabelProps> = ({
  sourceRef,
  sourcesData
}) => {
  const { aliases, setAlias, getDisplayName } = useSourceAliases()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(aliases[sourceRef] || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    setAlias(sourceRef, editValue)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  const displayName = getDisplayName(sourceRef, sourcesData)
  const hasAlias = !!aliases[sourceRef]

  if (isEditing) {
    return (
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={sourceRef}
          style={{
            fontSize: 'inherit',
            padding: '1px 4px',
            border: '1px solid var(--bs-primary, #20a8d8)',
            borderRadius: '3px',
            width: '180px',
            outline: 'none'
          }}
        />
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      <span style={hasAlias ? { fontStyle: 'italic' } : undefined}>
        {displayName}
      </span>
      <span
        onClick={handleStartEdit}
        title={hasAlias ? `Edit alias (raw: ${sourceRef})` : 'Set alias'}
        style={{
          cursor: 'pointer',
          opacity: 0.4,
          fontSize: '0.85em',
          lineHeight: 1
        }}
        className="source-alias-edit"
      >
        &#9998;
      </span>
    </span>
  )
}

export default SourceLabel
