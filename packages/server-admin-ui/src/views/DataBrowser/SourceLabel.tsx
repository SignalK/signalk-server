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
  const isCancelRef = useRef(false)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setEditValue(aliases[sourceRef] || '')
    isCancelRef.current = false
    setIsEditing(true)
  }

  const handleSave = () => {
    if (isCancelRef.current) {
      isCancelRef.current = false
      return
    }
    const currentAlias = aliases[sourceRef] || ''
    if (editValue !== currentAlias) {
      setAlias(sourceRef, editValue)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation()
      handleSave()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      isCancelRef.current = true
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
      <button
        type="button"
        onClick={handleStartEdit}
        title={hasAlias ? `Edit alias (raw: ${sourceRef})` : 'Set alias'}
        aria-label={
          hasAlias
            ? `Edit alias for ${sourceRef}`
            : `Set alias for ${sourceRef}`
        }
        style={{
          cursor: 'pointer',
          opacity: 0.4,
          fontSize: '0.85em',
          lineHeight: 1,
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'inherit'
        }}
        className="source-alias-edit"
      >
        &#9998;
      </button>
    </span>
  )
}

export default SourceLabel
