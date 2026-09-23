import React, { useState, useRef, useEffect } from 'react'
import { useStore, useLoginStatus } from '../../store'
import { notificationDataPath, resolveDisplayName } from './displayNameUtils'

interface PathDisplayNameProps {
  context: string
  path: string
}

const SUB_LINE_FONT_SIZE = '0.85em'
const SUB_LINE_TOP_MARGIN = '2px'
const EDIT_INPUT_WIDTH = '220px'
const PENCIL_OPACITY = 0.4
const ITEM_GAP = '3px'
const INLINE_PENCIL_LEFT_MARGIN = '4px'

// Latest save revision per row, module-level so a virtualized
// unmount/remount continues the same sequence — a stale settlement from
// a request started in a previous mount must not touch the store.
const saveRevisions = new Map<string, number>()

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
  const [saveFailed, setSaveFailed] = useState(false)
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
    setSaveFailed(false)
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
      // value for a revert is simply the currently shown name. Revert
      // and failure flag write to the global store / state directly, so
      // they behave the same even if the virtualized row unmounts while
      // the request is in flight — deliberately no AbortController,
      // which would falsely revert a write the server already accepted.
      const previous = name ?? null
      // Rapid consecutive saves can settle out of order; only the
      // latest request may revert the store or toggle the failure flag,
      // otherwise a stale rejection would clobber the newer optimistic
      // value with its older `previous` snapshot. Revisions are keyed
      // per row (context + path), not per component instance.
      const revisionKey = `${context}\0${path}`
      const seq = (saveRevisions.get(revisionKey) ?? 0) + 1
      saveRevisions.set(revisionKey, seq)
      const isCurrent = () => saveRevisions.get(revisionKey) === seq
      updateMeta(context, path, { displayName: trimmed || null })
      const onFailure = () => {
        if (!isCurrent()) return
        updateMeta(context, path, { displayName: previous })
        setSaveFailed(true)
      }
      // Provider-sourced paths are not guaranteed URL-safe.
      const encodedPath = path.split('.').map(encodeURIComponent).join('/')
      fetch(`/signalk/v1/api/vessels/self/${encodedPath}/meta/displayName`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: trimmed || null })
      })
        .then((res) => {
          if (!res.ok) {
            console.warn('displayName save rejected:', res.status)
            onFailure()
          } else if (isCurrent()) {
            setSaveFailed(false)
          }
        })
        .catch((err) => {
          console.warn('displayName save failed:', err)
          onFailure()
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
        style={{ fontSize: SUB_LINE_FONT_SIZE, marginTop: SUB_LINE_TOP_MARGIN }}
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
            width: EDIT_INPUT_WIDTH,
            outline: 'none'
          }}
        />
      </div>
    )
  }

  if (!name && !canEdit) return null

  const pencil = canEdit && (
    <button
      type="button"
      onClick={handleStartEdit}
      title={
        name
          ? `Edit displayName (meta.displayName at ${path})`
          : `Set displayName (meta.displayName at ${path})`
      }
      aria-label={
        name ? `Edit displayName for ${path}` : `Set displayName for ${path}`
      }
      className="path-displayname-edit"
      style={{
        cursor: 'pointer',
        opacity: PENCIL_OPACITY,
        fontSize: SUB_LINE_FONT_SIZE,
        lineHeight: 1,
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'inherit'
      }}
    >
      &#9998;
    </button>
  )

  const failure = saveFailed && (
    <span
      role="alert"
      style={{
        color: 'var(--bs-danger, #d9534f)',
        fontSize: SUB_LINE_FONT_SIZE
      }}
      title="The server rejected the displayName change; the previous value was restored."
    >
      Save failed
    </span>
  )

  // Unnamed rows stay single-line: the pencil flows inline after the
  // path instead of opening an almost-empty second row, so the table
  // keeps its density until a name actually needs the space.
  if (!name) {
    return (
      <span
        className="path-display-name"
        style={{
          marginLeft: INLINE_PENCIL_LEFT_MARGIN,
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: ITEM_GAP
        }}
      >
        {failure}
        {pencil}
      </span>
    )
  }

  return (
    <div
      className="path-display-name text-muted"
      style={{
        fontSize: SUB_LINE_FONT_SIZE,
        marginTop: SUB_LINE_TOP_MARGIN,
        display: 'flex',
        alignItems: 'center',
        gap: ITEM_GAP
      }}
    >
      <span style={{ fontStyle: 'italic' }}>{name}</span>
      {failure}
      {pencil}
    </div>
  )
}

export default PathDisplayName
