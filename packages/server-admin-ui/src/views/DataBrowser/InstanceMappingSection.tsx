import React, { useEffect, useMemo, useState } from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Spinner from 'react-bootstrap/Spinner'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons/faInfoCircle'
import type { N2kDeviceEntry } from '../../utils/sourceLabels'
import { deviceKeyFromCanName } from '../../utils/n2kDeviceKey'
import {
  useLoginStatus,
  useN2kInstanceRules,
  useStore,
  type N2kInstanceRule
} from '../../store'
import {
  buildMappingRows,
  describeMappingRow,
  discriminatorLabel,
  evaluateMappings,
  groupLabel,
  hasMappingRule,
  instanceLabel,
  PATH_SLOT,
  slotParts,
  type InstanceScan,
  type MappingDrafts,
  type MappingRowState,
  type TargetEditor,
  type TargetValue
} from './n2kInstances'

const DOCS_URL =
  '/admin/#/documentation/Configuration/NMEA_2000_Device_Management.html#instance-path-mapping'

const labelStyle = {
  fontWeight: 500 as const,
  color: 'var(--bs-secondary-color, #6c757d)'
}

const helpStyle = {
  fontSize: '0.8rem',
  color: 'var(--bs-secondary-color, #6c757d)',
  margin: '2px 0'
}

const DIRTY_ROW_STYLE = {
  backgroundColor: 'var(--bs-warning-bg-subtle, #fff3cd)'
}

function deviceKeyOf(device: N2kDeviceEntry): string | undefined {
  return device.canName ? deviceKeyFromCanName(device.canName) : undefined
}

function useIsAdmin(): boolean {
  const loginStatus = useLoginStatus()
  return (
    !loginStatus.authenticationRequired || loginStatus.userLevel === 'admin'
  )
}

/**
 * Tells an instance editor that the instance has a Signal K path stored for
 * its number, and whether the server moves that path along when the editor
 * renumbers the instance.
 */
export const MappedInstanceNotice: React.FC<{
  device: N2kDeviceEntry
  group: string
  discriminator?: number
  instance: number
  followsRenumber?: boolean
}> = ({ device, group, discriminator, instance, followsRenumber }) => {
  const rules = useN2kInstanceRules(deviceKeyOf(device))
  if (!hasMappingRule(rules, { group, discriminator, instance })) return null
  return (
    <div style={{ ...helpStyle, marginLeft: '12px' }}>
      <FontAwesomeIcon icon={faInfoCircle} /> This instance has a Signal K path
      set below;{' '}
      {followsRenumber
        ? 'renumbering it here moves that path to the new instance.'
        : 'changing the instance number leaves that path with the old number.'}
    </div>
  )
}

type LoadState = 'loading' | 'loaded' | 'forbidden' | 'failed'

function useStoredRules(deviceKey: string | undefined, enabled: boolean) {
  const rules = useN2kInstanceRules(deviceKey)
  const setDeviceRules = useStore((s) => s.setN2kDeviceInstanceMappings)
  const [failure, setFailure] = useState<'forbidden' | 'failed' | null>(null)

  useEffect(() => {
    if (!enabled || deviceKey === undefined || rules !== undefined) return
    let cancelled = false
    fetch(
      `${window.serverRoutesPrefix}/n2kInstanceMappings/${encodeURIComponent(deviceKey)}`,
      { credentials: 'include' }
    )
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401 || res.status === 403) {
          setFailure('forbidden')
        } else if (!res.ok) {
          setFailure('failed')
        } else {
          setDeviceRules(deviceKey, (await res.json()) as N2kInstanceRule[])
        }
      })
      .catch(() => {
        if (!cancelled) setFailure('failed')
      })
    return () => {
      cancelled = true
    }
  }, [enabled, deviceKey, rules, setDeviceRules])

  const state: LoadState =
    rules !== undefined ? 'loaded' : (failure ?? 'loading')
  return { rules, state }
}

async function putRules(
  deviceKey: string,
  rules: N2kInstanceRule[]
): Promise<void> {
  const res = await fetch(
    `${window.serverRoutesPrefix}/n2kInstanceMappings/${encodeURIComponent(deviceKey)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules)
    }
  )
  if (res.ok) return
  const body = (await res.json().catch(() => undefined)) as
    { message?: string } | undefined
  throw new Error(body?.message ?? `HTTP ${res.status}`)
}

const NO_RULES: N2kInstanceRule[] = []

/**
 * Edits where the device's data instances land in the Signal K tree.
 * Rows are the mappable instances the scan heard, merged with the stored
 * rules; one Save sends the device's complete rule list.
 */
const InstanceMappingSection: React.FC<{
  device: N2kDeviceEntry
  /** The device's instance scan; undefined when it sends no mappable PGN. */
  scan?: InstanceScan
}> = ({ device, scan }) => {
  const isAdmin = useIsAdmin()
  const deviceKey = deviceKeyOf(device)
  const { rules: storedRules, state } = useStoredRules(deviceKey, isAdmin)
  const stored = storedRules ?? NO_RULES
  const setDeviceRules = useStore((s) => s.setN2kDeviceInstanceMappings)
  const [drafts, setDrafts] = useState<MappingDrafts>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const evaluation = useMemo(
    () =>
      evaluateMappings(
        buildMappingRows(scan?.instances ?? [], stored),
        stored,
        drafts
      ),
    [scan?.instances, stored, drafts]
  )

  if (!isAdmin || state === 'forbidden') return null
  if (!scan && (deviceKey === undefined || stored.length === 0)) return null

  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginTop: '8px'
      }}
    >
      <span style={{ ...labelStyle, fontWeight: 600 }}>Signal K paths</span>
      {scan && deviceKey !== undefined && !scan.loading && (
        <Button
          size="sm"
          variant="outline-secondary"
          style={{ fontSize: '0.8em', padding: '1px 6px' }}
          onClick={scan.rescan}
        >
          Re-scan
        </Button>
      )}
    </div>
  )

  const help = (
    <>
      <p style={helpStyle}>
        The path is where this device writes an instance&apos;s data in the
        Signal K tree. Every path under it moves, notifications included;
        temperature, humidity and pressure take the full path of their one
        value. This is separate from the Data Instances label, which is metadata
        stored in the device and does not change any path. Paths belong to the
        device and apply on every connection it is seen on.
      </p>
      <p style={helpStyle}>
        Not moved with a new path: recorded history, source priority path
        overrides, metadata edits, and PUT handling and NMEA 2000 output, which
        keep using the paths n2k-signalk writes.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          Documentation
        </a>
      </p>
    </>
  )

  if (deviceKey === undefined) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        {header}
        <p style={helpStyle}>
          Paths can be set once the device&apos;s address claim is received.
        </p>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        {header}
        <span style={{ color: 'var(--bs-danger, #f86c6b)' }}>
          Failed to load the Signal K paths
        </span>
      </div>
    )
  }

  if (state === 'loading' || scan?.loading) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        {header}
        <Spinner size="sm" animation="border" />{' '}
        <span style={{ fontSize: '0.85em', color: '#888' }}>
          {scan?.loading
            ? 'Listening to N2K bus (~6s)...'
            : 'Loading Signal K paths...'}
        </span>
      </div>
    )
  }

  const edit = (key: string, value: TargetValue | null | undefined) => {
    setDrafts((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
    setSaved(false)
  }

  const revert = () => {
    setDrafts({})
    setServerError(null)
    setSaved(false)
  }

  const save = () => {
    const rules = evaluation.rules
    setSaving(true)
    setServerError(null)
    putRules(deviceKey, rules)
      .then(() => {
        setDeviceRules(deviceKey, rules)
        setDrafts({})
        setSaved(true)
      })
      .catch((err: Error) => setServerError(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      {header}
      {help}
      {scan?.error && (
        <div style={{ color: 'var(--bs-danger, #f86c6b)' }}>
          Scan failed: {scan.error}
        </div>
      )}
      {evaluation.rows.length === 0 && (
        <p style={{ ...helpStyle, color: '#888' }}>
          No instances with a settable path detected
        </p>
      )}
      {evaluation.rows.length > 0 && (
        <>
          <Table size="sm" bordered responsive style={{ marginBottom: '4px' }}>
            <thead>
              <tr>
                <th>Group</th>
                <th>Type / source</th>
                <th>N2K data instance</th>
                <th>Signal K path</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.rows.map((rowState) => (
                <MappingRowView
                  key={rowState.row.key}
                  state={rowState}
                  disabled={saving}
                  onEdit={edit}
                />
              ))}
            </tbody>
          </Table>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              size="sm"
              variant="primary"
              disabled={!evaluation.dirty || !evaluation.valid || saving}
              onClick={save}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={!evaluation.dirty || saving}
              onClick={revert}
            >
              Discard
            </Button>
            {saved && (
              <span style={{ color: 'var(--bs-success, #4dbd74)' }}>
                Paths saved
              </span>
            )}
            {serverError && (
              <span role="alert" style={{ color: 'var(--bs-danger, #f86c6b)' }}>
                {serverError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const monoStyle = { fontFamily: 'monospace', fontSize: '0.8rem' }

const SLOT_LABELS: Record<string, string> = {
  '<id>': 'Id',
  '<zone>': 'Zone',
  '<path>': 'Path'
}

// Branch and fixed templates end in `.<id>`; their select shows the root
// alone and the id input follows it.
function takesId(editor: TargetEditor): boolean {
  return editor.kind === 'fixed' || editor.kind === 'branch'
}

const OTHER_PATH = 'Other path'

function choiceLabel(editor: TargetEditor, template: string): string {
  if (template === PATH_SLOT && editor.kind !== 'free') return `${OTHER_PATH}…`
  const parts = slotParts(template)
  return takesId(editor) && parts ? parts.before.slice(0, -1) : template
}

const TargetEditorView: React.FC<{
  editor: TargetEditor
  choices: string[]
  /** Undefined leaves the editor empty. */
  value?: TargetValue
  error?: string
  description: string
  disabled: boolean
  /** Shown at the end of the editor's last line. */
  trailing?: React.ReactNode
  onChange: (value: TargetValue) => void
}> = ({
  editor,
  choices,
  value,
  error,
  description,
  disabled,
  trailing,
  onChange
}) => {
  // With one template and a name to type, the empty editor is that
  // template with no name; otherwise the select starts on its placeholder.
  const [onlyChoice] = choices
  const needsSelect = choices.length > 1 || !slotParts(onlyChoice)
  const shown =
    value ?? (needsSelect ? undefined : { template: onlyChoice, name: '' })
  const parts = shown && slotParts(shown.template)
  // An other path is a whole path: it sits on the select's line and takes
  // no name from, or gives none to, the other choices.
  const otherPath = needsSelect && parts?.slot === PATH_SLOT
  const select = needsSelect && (
    <Form.Select
      size="sm"
      aria-label={`Path for ${description}`}
      value={shown?.template ?? ''}
      disabled={disabled}
      style={{ ...monoStyle, width: 'auto', maxWidth: '100%' }}
      onChange={(e) => {
        const keepsName =
          slotParts(e.target.value) !== undefined &&
          !otherPath &&
          e.target.value !== PATH_SLOT
        onChange({
          template: e.target.value,
          name: keepsName ? (shown?.name ?? '') : ''
        })
      }}
    >
      {!shown && (
        <option value="" disabled>
          Choose…
        </option>
      )}
      {choices.map((template) => (
        <option key={template} value={template}>
          {choiceLabel(editor, template)}
        </option>
      ))}
    </Form.Select>
  )
  const nameInput = parts && (
    <Form.Control
      type="text"
      size="sm"
      aria-label={`${otherPath ? OTHER_PATH : SLOT_LABELS[parts.slot]} for ${description}`}
      isInvalid={error !== undefined}
      aria-invalid={error !== undefined}
      value={shown.name}
      disabled={disabled}
      style={{
        ...monoStyle,
        width: parts.slot === PATH_SLOT ? '26em' : '9em',
        maxWidth: '100%'
      }}
      onChange={(e) => onChange({ ...shown, name: e.target.value })}
    />
  )
  const inline: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...monoStyle
  }
  const trailer = trailing && (
    <span style={{ marginLeft: '8px' }}>{trailing}</span>
  )
  const groupProps = {
    role: 'group',
    'aria-label': `Path editor for ${description}`
  }
  if (otherPath) {
    return (
      <div {...groupProps} style={inline}>
        {select}
        <span style={{ marginLeft: '4px' }}>{nameInput}</span>
        {trailer}
      </div>
    )
  }
  if (takesId(editor)) {
    return (
      <div {...groupProps} style={inline}>
        {select}
        {parts && (
          <>
            <span>{select ? '.' : parts.before}</span>
            {nameInput}
          </>
        )}
        {trailer}
      </div>
    )
  }
  return (
    <div {...groupProps} style={{ display: 'grid', gap: '4px' }}>
      {select && (
        <div style={inline}>
          {select}
          {!parts && trailer}
        </div>
      )}
      {parts && (
        <div style={inline}>
          <span>{parts.before}</span>
          {nameInput}
          <span>{parts.after}</span>
          {trailer}
        </div>
      )}
    </div>
  )
}

const MappingRowView: React.FC<{
  state: MappingRowState
  disabled: boolean
  /** undefined drops the row's edit. */
  onEdit: (key: string, value: TargetValue | null | undefined) => void
}> = ({ state, disabled, onEdit }) => {
  const { row, choices, value, target, dirty, resetTo, error, warning } = state
  const description = describeMappingRow(row)
  const cellStyle = dirty ? DIRTY_ROW_STYLE : undefined
  const reset = resetTo !== undefined && (
    <Button
      size="sm"
      variant="link"
      style={{ padding: 0, fontSize: '0.8rem' }}
      title={`Reset to ${resetTo}`}
      aria-label={`Reset path for ${description}`}
      disabled={disabled}
      onClick={() => onEdit(row.key, { template: resetTo, name: '' })}
    >
      Reset
    </Button>
  )
  return (
    <tr style={cellStyle}>
      <td style={cellStyle}>{groupLabel(row.group)}</td>
      <td style={cellStyle}>
        {discriminatorLabel(row.group, row.discriminator) ?? ''}
      </td>
      <td style={cellStyle}>{instanceLabel(row.group, row.instance)}</td>
      <td style={cellStyle}>
        {row.editor && value !== null ? (
          <>
            {value === undefined && (
              <div style={{ ...helpStyle, fontFamily: 'monospace' }}>
                Current path: {target}
              </div>
            )}
            <TargetEditorView
              editor={row.editor}
              choices={choices}
              value={value}
              error={error}
              description={description}
              disabled={disabled}
              trailing={reset}
              onChange={(next) => onEdit(row.key, next)}
            />
            {error && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--bs-danger, #f86c6b)'
                }}
              >
                {error}
              </div>
            )}
          </>
        ) : value === null ? (
          <span style={{ color: '#888' }}>
            Removed on save{' '}
            <Button
              size="sm"
              variant="link"
              style={{ padding: 0, fontSize: 'inherit' }}
              onClick={() => onEdit(row.key, undefined)}
              disabled={disabled}
            >
              Undo
            </Button>
          </span>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <span style={monoStyle}>{target}</span>
            <Badge bg="secondary">not currently observed</Badge>
            <Button
              size="sm"
              variant="outline-danger"
              style={{ fontSize: '0.8em', padding: '1px 6px' }}
              disabled={disabled}
              onClick={() => onEdit(row.key, null)}
              aria-label={`Delete path for ${description}`}
            >
              Delete
            </Button>
          </div>
        )}
        {warning && (
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--bs-warning-text-emphasis, #997404)'
            }}
          >
            {warning}
          </div>
        )}
      </td>
    </tr>
  )
}

export default InstanceMappingSection
