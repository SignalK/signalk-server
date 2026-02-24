import React, { useState, useEffect, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Collapse from 'react-bootstrap/Collapse'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import Creatable from 'react-select/creatable'
import uniq from 'lodash.uniq'
import { useStore, useSourcePriorities } from '../../store'
import { useSources } from '../../hooks/useSources'
import { getSourceDisplayLabel } from '../../hooks/sourceLabelUtils'

// Types
interface Priority {
  sourceRef: string
  timeout: string | number
}

interface PathPriority {
  path: string
  priorities: Priority[]
}

interface SelectOption {
  label: string
  value: string
}

function fetchSourceRefs(path: string, cb: (refs: string[]) => void) {
  fetch(`/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then((pathResponse) => {
      let sourceRefs = [pathResponse.$source]
      if (pathResponse.values) {
        sourceRefs = sourceRefs.concat(Object.keys(pathResponse.values))
      }
      return uniq(sourceRefs)
    })
    .then(cb)
}

interface PrefsEditorProps {
  path: string
  priorities: Priority[]
  pathIndex: number
  isSaving: boolean
  sources: Record<string, unknown>
}

const PrefsEditor: React.FC<PrefsEditorProps> = ({
  path,
  priorities,
  pathIndex,
  isSaving,
  sources
}) => {
  const changePriority = useStore((s) => s.changePriority)
  const deletePriority = useStore((s) => s.deletePriority)
  const movePriority = useStore((s) => s.movePriority)

  const [isOpen, setIsOpen] = useState(false)
  const [sourceRefs, setSourceRefs] = useState<string[]>([])

  useEffect(() => {
    if (path) {
      fetchSourceRefs(path, (refs) => {
        setSourceRefs(refs)
      })
    }
  }, [path])

  const toggleEditor = () => setIsOpen((prev) => !prev)

  const resolveSourceLabel = (ref: string): string =>
    getSourceDisplayLabel(ref, sources)

  const options: SelectOption[] = sourceRefs.map((ref) => ({
    label: resolveSourceLabel(ref),
    value: ref
  }))

  return (
    <div>
      {!isOpen && <div onClick={toggleEditor}>...</div>}
      <Collapse in={isOpen}>
        <Table>
          <thead onClick={toggleEditor}>
            <tr>
              <td style={{ width: '30px' }}>#</td>
              <td>Source Reference (see DataBrowser for details)</td>
              <td style={{ width: '120px' }}>Timeout (ms)</td>
              <td style={{ width: '80px' }}>Order</td>
              <td></td>
            </tr>
          </thead>
          <tbody>
            {[...priorities, { sourceRef: '', timeout: '' }].map(
              ({ sourceRef, timeout }, index) => {
                // Priority items are ordered and may have empty sourceRef
                const priorityKey = `${index}-${sourceRef || 'new'}`
                return (
                  <tr key={priorityKey}>
                    <td>{index + 1}.</td>
                    <td>
                      <Creatable
                        menuPortalTarget={document.body}
                        options={options}
                        value={{
                          value: sourceRef,
                          label: resolveSourceLabel(sourceRef)
                        }}
                        onChange={(e) => {
                          changePriority(
                            pathIndex,
                            index,
                            e?.value || '',
                            timeout
                          )
                        }}
                      />
                    </td>
                    <td>
                      {index > 0 && (
                        <Form.Control
                          type="number"
                          name="timeout"
                          onChange={(e) =>
                            changePriority(
                              pathIndex,
                              index,
                              sourceRef,
                              e.target.value
                            )
                          }
                          value={timeout}
                        />
                      )}
                    </td>
                    <td>
                      {index > 0 && index < priorities.length && (
                        <button
                          type="button"
                          onClick={() =>
                            !isSaving && movePriority(pathIndex, index, -1)
                          }
                        >
                          <FontAwesomeIcon icon={faArrowUp} />
                        </button>
                      )}
                      {index < priorities.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            !isSaving && movePriority(pathIndex, index, 1)
                          }
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </button>
                      )}
                    </td>
                    <td>
                      {index < priorities.length && (
                        <FontAwesomeIcon
                          icon={faTrash}
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            !isSaving && deletePriority(pathIndex, index)
                          }
                        />
                      )}
                    </td>
                  </tr>
                )
              }
            )}
          </tbody>
        </Table>
      </Collapse>
    </div>
  )
}

function fetchAvailablePaths(cb: (paths: string[]) => void) {
  fetch(`${window.serverRoutesPrefix}/availablePaths`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then(cb)
}

const SourcePriorities: React.FC = () => {
  const sourcePrioritiesData = useSourcePriorities()
  const changePath = useStore((s) => s.changePath)
  const deletePath = useStore((s) => s.deletePath)
  const setSaving = useStore((s) => s.setSaving)
  const setSaved = useStore((s) => s.setSaved)
  const setSaveFailed = useStore((s) => s.setSaveFailed)
  const clearSaveFailed = useStore((s) => s.clearSaveFailed)

  const { sourcePriorities, saveState } = sourcePrioritiesData

  const [availablePaths, setAvailablePaths] = useState<SelectOption[]>([])
  const sources = useSources()

  useEffect(() => {
    fetchAvailablePaths((pathsArray) => {
      setAvailablePaths(
        pathsArray.map((path) => ({
          value: path,
          label: path
        }))
      )
    })
  }, [])

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setSaving()
      fetch(`${window.serverRoutesPrefix}/sourcePriorities`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          sourcePriorities.reduce<Record<string, Priority[]>>(
            (acc, pathPriority) => {
              acc[pathPriority.path] = pathPriority.priorities
              return acc
            },
            {}
          )
        )
      })
        .then((response) => {
          if (response.status === 200) {
            setSaved()
          } else {
            throw new Error()
          }
        })
        .catch(() => {
          setSaveFailed()
          setTimeout(() => clearSaveFailed(), 5000)
        })
    },
    [sourcePriorities, setSaving, setSaved, setSaveFailed, clearSaveFailed]
  )

  const priosWithEmpty: PathPriority[] = [
    ...sourcePriorities,
    { path: '', priorities: [] }
  ]

  return (
    <Card>
      <Card.Header>Source Priorities Settings</Card.Header>
      <Card.Body>
        <Alert>
          <p>
            Use Source Priorities to filter incoming data so that data from
            lower priority sources is discarded when there is fresh data from
            some higher priority source.
          </p>
          <p>
            Incoming data is not handled if the{' '}
            <b>
              latest value for a path is from a higher priority source and it is
              not older than the timeout
            </b>{' '}
            specified for the source of the incoming data. Timeout for data from
            unlisted sources is 10 seconds.
          </p>
          <p>
            You can debug the settings by saving them and activating debug key{' '}
            <b>signalk-server:sourcepriorities</b> in{' '}
            <a
              href="./#/serverConfiguration/log"
              className="text-decoration-none"
            >
              Server Log
            </a>
          </p>
        </Alert>
        <Table responsive bordered striped size="sm">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Path</th>
              <th>Priorities</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {priosWithEmpty.map(({ path, priorities }, index) => {
              // Path items may be empty for new entries
              const pathKey = `${index}-${path || 'new'}`
              return (
                <tr key={pathKey}>
                  <td>
                    <Creatable
                      menuPortalTarget={document.body}
                      options={availablePaths}
                      value={{ value: path, label: path }}
                      onChange={(e) => {
                        changePath(index, e?.value || '')
                      }}
                    />
                  </td>
                  <td>
                    <PrefsEditor
                      key={path}
                      path={path}
                      priorities={priorities}
                      pathIndex={index}
                      isSaving={saveState.isSaving || false}
                      sources={sources}
                    />
                  </td>
                  <td style={{ border: 'none' }}>
                    {index < sourcePriorities.length && (
                      <FontAwesomeIcon
                        icon={faTrash}
                        style={{ cursor: 'pointer' }}
                        onClick={() => deletePath(index)}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card.Body>
      <Card.Footer>
        <Button
          size="sm"
          variant="primary"
          disabled={
            !saveState.dirty || saveState.isSaving || !saveState.timeoutsOk
          }
          onClick={handleSave}
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> Save
        </Button>
        {saveState.saveFailed && 'Saving priorities settings failed!'}
        {!saveState.timeoutsOk && (
          <span style={{ paddingLeft: '10px' }}>
            <Badge bg="danger">Error</Badge>
            {
              'The timeout values need to be numbers in ascending order, please fix.'
            }
          </span>
        )}
      </Card.Footer>
    </Card>
  )
}

export default SourcePriorities
