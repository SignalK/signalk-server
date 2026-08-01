import React, { useState, useRef, useEffect } from 'react'
import { useStore, useLoginStatus } from '../../store'
import { notificationDataPath, resolveDisplayName } from './displayNameUtils'

interface PathDisplayNameProps {
  context: string
  path: string
}

// Muted second line under the path showing meta.displayName, with the
// same inline pencil editing pattern as SourceLabel. The name shown is
// exactly the one stored at the row's own path (notifications rows
// mirror their data path read-only), and edits write plain
// meta.displayName at that path — nothing is stored anywhere else.
const PathDisplayName: React.FC<PathDisplayNameProps> = ({ context, path }) => {
  const loginStatus = useLoginStatus()
  const updateMeta = useStore((s) => s.updateMeta)
  // Primitive selector result so a row only re-renders when its resolved
  // name actually changes, not on every meta delta in the context.
  const resolvedKey = useStore((s) => {
    const resolved = resolveDisplayName(s.signalkMeta[context], path)
    return resolved ? `${resolved.metaPath}\0${resolved.name}` : null
  })
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

  const name = resolvedKey
    ? resolvedKey.slice(resolvedKey.indexOf('\0') + 1)
    : undefined

  // The PUT endpoint writes vessels.self only, and notifications rows
  // just mirror their data path — the pencil lives on the data row.
  const canEdit =
    context === 'self' &&
    notificationDataPath(path) === undefined &&
    (!loginStatus.authenticationRequired ||
      (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin'))

  const handleStartEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setEditValue(name ?? '')
    isCancelRef.current = false
    setIsEditing(true)
  }

  const handleSave = () => {
    if (isCancelRef.current) {
      isCancelRef.current = false
      return
    }
    const trimmed = editValue.trim()
    if (trimmed !== (name ?? '')) {
      // Editable rows resolve at their own path only, so the previous
      // value for a revert is simply the currently shown name.
      const previous = name ?? null
      updateMeta(context, path, { displayName: trimmed || null })
      const revert = () => updateMeta(context, path, { displayName: previous })
      fetch(
        `/signalk/v1/api/vessels/self/${path.replaceAll('.', '/')}/meta/displayName`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: trimmed || null })
        }
      )
        .then((res) => {
          if (!res.ok) {
            console.warn('displayName save rejected:', res.status)
            revert()
          }
        })
        .catch((err) => {
          console.warn('displayName save failed:', err)
          revert()
        })
    }
    // Press-Enter calls this directly and then setIsEditing(false)
    // unmounts the input, which fires onBlur and re-enters handleSave.
    // Re-using the cancel ref short-circuits that second pass.
    isCancelRef.current = true
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleSave()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      isCancelRef.current = true
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div
        className="path-display-name"
        style={{ fontSize: '0.85em', marginTop: '2px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="displayName"
          aria-label={`displayName for ${path}`}
          style={{
            fontSize: 'inherit',
            padding: '1px 4px',
            border: '1px solid var(--bs-primary, #20a8d8)',
            borderRadius: '3px',
            width: '220px',
            outline: 'none'
          }}
        />
      </div>
    )
  }

  if (!name && !canEdit) return null

  return (
    <div
      className="path-display-name text-muted"
      style={{
        fontSize: '0.85em',
        marginTop: '2px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px'
      }}
    >
      {name && <span style={{ fontStyle: 'italic' }}>{name}</span>}
      {canEdit && (
        <button
          type="button"
          onClick={handleStartEdit}
          title={
            name
              ? `Edit displayName (meta.displayName at ${path})`
              : `Set displayName (meta.displayName at ${path})`
          }
          aria-label={
            name
              ? `Edit displayName for ${path}`
              : `Set displayName for ${path}`
          }
          className="path-displayname-edit"
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
        >
          &#9998;
        </button>
      )}
    </div>
  )
}

export default PathDisplayName
