import React, { useState, useEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Collapse,
  Input,
  Table
} from 'reactstrap'
import Creatable from 'react-select/creatable'
import remove from 'lodash.remove'
import uniq from 'lodash.uniq'

// Action types - exported for reducer
export const SOURCEPRIOS_PRIO_CHANGED = 'SOURCEPRIOS_PPRIO_CHANGED'
export const SOURCEPRIOS_PRIO_DELETED = 'SOURCEPRIOS_PRIO_DELETED'
export const SOURCEPRIOS_PRIO_MOVED = 'SOURCEPRIOS_PRIO_MOVED'

export const SOURCEPRIOS_PATH_CHANGED = 'SOURCEPRIOS_PATH_CHANGED'
export const SOURCEPRIOS_PATH_DELETED = 'SOURCEPRIOS_PATH_DELETED'

export const SOURCEPRIOS_SAVING = 'SOURCEPRIOS_SAVING'
export const SOURCEPRIOS_SAVED = 'SOURCEPRIOS_SAVED'
export const SOURCEPRIOS_SAVE_FAILED = 'SOURCEPRIOS_SAVE_FAILED'
export const SOURCEPRIOS_SAVE_FAILED_OVER = 'SOURCEPRIOS_SAVE_FAILED_OVER'

// Types
interface Priority {
  sourceRef: string
  timeout: string | number
}

interface PathPriority {
  path: string
  priorities: Priority[]
}

interface SaveState {
  dirty: boolean
  isSaving: boolean
  saveFailed: boolean
  timeoutsOk: boolean
}

interface SourcePrioritiesData {
  sourcePriorities: PathPriority[]
  saveState: SaveState
}

interface SourcePriosAction {
  type: string
  data?: {
    path?: string
    index?: number
    pathIndex?: number
    sourceRef?: string
    timeout?: string | number
    change?: number
  }
}

interface RootState {
  sourcePrioritiesData: SourcePrioritiesData
}

interface SelectOption {
  label: string
  value: string
}

// Helper function
function checkTimeouts(sourcePriorities: Priority[]): boolean {
  return sourcePriorities.reduce<boolean>((acc, prio, i) => {
    const { timeout } = prio
    if (!acc) {
      return acc
    }

    if (i === 0) {
      return true
    }

    const thisOne = Number(timeout)
    if (Number.isNaN(thisOne) || thisOne <= 0) {
      return false
    }
    if (i === 1) {
      return true
    }
    return thisOne > Number(sourcePriorities[i - 1].timeout)
  }, true)
}

// Reducer - exported for use in root reducer
export const reduceSourcePriorities = (
  state: SourcePrioritiesData,
  action: SourcePriosAction
): SourcePrioritiesData => {
  const sourcePriorities: PathPriority[] = JSON.parse(
    JSON.stringify(state.sourcePriorities)
  )
  let saveState = { ...state.saveState }
  const { path, index, pathIndex, sourceRef, timeout, change } =
    action.data || {}
  const prios =
    pathIndex !== undefined
      ? sourcePriorities[pathIndex]?.priorities
      : undefined

  switch (action.type) {
    case SOURCEPRIOS_PATH_CHANGED:
      if (index === sourcePriorities.length) {
        sourcePriorities.push({ path: '', priorities: [] })
      }
      if (index !== undefined && path !== undefined) {
        sourcePriorities[index].path = path
      }
      saveState.dirty = true
      break

    case SOURCEPRIOS_PATH_DELETED:
      remove(sourcePriorities, (_, i) => i === index)
      saveState.dirty = true
      break

    case SOURCEPRIOS_PRIO_CHANGED:
      if (pathIndex === sourcePriorities.length) {
        sourcePriorities.push({ path: '', priorities: [] })
      }
      if (prios && index !== undefined) {
        if (index === prios.length) {
          prios.push({ sourceRef: '', timeout: '' })
        }
        prios[index] = {
          sourceRef: sourceRef || '',
          timeout: timeout !== undefined ? timeout : ''
        }
      }
      saveState.dirty = true
      saveState.timeoutsOk = prios ? checkTimeouts(prios) : true
      break

    case SOURCEPRIOS_PRIO_DELETED:
      if (prios) {
        remove(prios, (_, i) => i === index)
      }
      saveState.dirty = true
      break

    case SOURCEPRIOS_PRIO_MOVED:
      if (prios && index !== undefined && change !== undefined) {
        const tmp = prios[index]
        prios[index] = prios[index + change]
        prios[index + change] = tmp
      }
      saveState.dirty = true
      saveState.timeoutsOk = prios ? checkTimeouts(prios) : true
      break

    case SOURCEPRIOS_SAVING:
      saveState = {
        ...saveState,
        isSaving: true,
        saveFailed: false
      }
      break

    case SOURCEPRIOS_SAVED:
      saveState = {
        ...saveState,
        dirty: false,
        isSaving: false,
        saveFailed: false
      }
      break

    case SOURCEPRIOS_SAVE_FAILED:
      saveState = {
        ...saveState,
        isSaving: false,
        saveFailed: true
      }
      break

    case SOURCEPRIOS_SAVE_FAILED_OVER:
      saveState = {
        ...saveState,
        saveFailed: false
      }
      break

    default:
      return state
  }
  return { sourcePriorities, saveState }
}

// Fetch source refs helper
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

// Prefs Editor Component
interface PrefsEditorProps {
  path: string
  priorities: Priority[]
  pathIndex: number
  isSaving: boolean
}

const PrefsEditor: React.FC<PrefsEditorProps> = ({
  path,
  priorities,
  pathIndex,
  isSaving
}) => {
  const dispatch = useDispatch()
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

  const options: SelectOption[] = sourceRefs.map((ref) => ({
    label: ref,
    value: ref
  }))

  return (
    <div>
      {!isOpen && <div onClick={toggleEditor}>...</div>}
      <Collapse isOpen={isOpen}>
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
                return (
                  <tr key={index}>
                    <td>{index + 1}.</td>
                    <td>
                      <Creatable
                        menuPortalTarget={document.body}
                        options={options}
                        value={{ value: sourceRef, label: sourceRef }}
                        onChange={(e) => {
                          dispatch({
                            type: SOURCEPRIOS_PRIO_CHANGED,
                            data: {
                              pathIndex,
                              sourceRef: e?.value || '',
                              timeout,
                              index
                            }
                          })
                        }}
                      />
                    </td>
                    <td>
                      {index > 0 && (
                        <Input
                          type="number"
                          name="timeout"
                          onChange={(e) =>
                            dispatch({
                              type: SOURCEPRIOS_PRIO_CHANGED,
                              data: {
                                pathIndex,
                                sourceRef,
                                timeout: e.target.value,
                                index
                              }
                            })
                          }
                          value={timeout}
                        />
                      )}
                    </td>
                    <td>
                      {index > 0 && index < priorities.length && (
                        <button
                          onClick={() =>
                            !isSaving &&
                            dispatch({
                              type: SOURCEPRIOS_PRIO_MOVED,
                              data: {
                                pathIndex,
                                index,
                                change: -1
                              }
                            })
                          }
                        >
                          <i className="fas fa-arrow-up" />
                        </button>
                      )}
                      {index < priorities.length - 1 && (
                        <button
                          onClick={() =>
                            !isSaving &&
                            dispatch({
                              type: SOURCEPRIOS_PRIO_MOVED,
                              data: {
                                pathIndex,
                                index,
                                change: 1
                              }
                            })
                          }
                        >
                          <i className="fas fa-arrow-down" />
                        </button>
                      )}
                    </td>
                    <td>
                      {index < priorities.length && (
                        <i
                          className="fas fa-trash"
                          onClick={() =>
                            !isSaving &&
                            dispatch({
                              type: SOURCEPRIOS_PRIO_DELETED,
                              data: {
                                pathIndex,
                                index
                              }
                            })
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

// Thunk action for saving
const sourcePrioritySave =
  (sourcePriorities: PathPriority[]) =>
  (dispatch: (action: SourcePriosAction) => void) => {
    dispatch({
      type: SOURCEPRIOS_SAVING
    })
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
          dispatch({
            type: SOURCEPRIOS_SAVED
          })
        } else {
          throw new Error()
        }
      })
      .catch(() => {
        dispatch({
          type: SOURCEPRIOS_SAVE_FAILED
        })
        setTimeout(() => dispatch({ type: SOURCEPRIOS_SAVE_FAILED_OVER }), 5000)
      })
  }

// Fetch available paths helper
function fetchAvailablePaths(cb: (paths: string[]) => void) {
  fetch(`${window.serverRoutesPrefix}/availablePaths`, {
    credentials: 'include'
  })
    .then((response) => response.json())
    .then(cb)
}

// Main SourcePriorities Component
const SourcePriorities: React.FC = () => {
  const dispatch = useDispatch()
  const sourcePriorities = useSelector(
    (state: RootState) => state.sourcePrioritiesData.sourcePriorities
  )
  const saveState = useSelector(
    (state: RootState) => state.sourcePrioritiesData.saveState
  )

  const [availablePaths, setAvailablePaths] = useState<SelectOption[]>([])

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
      // @ts-expect-error thunk dispatch
      dispatch(sourcePrioritySave(sourcePriorities))
    },
    [dispatch, sourcePriorities]
  )

  const priosWithEmpty = [...sourcePriorities, { path: '', priorities: [] }]

  return (
    <Card>
      <CardHeader>Source Priorities Settings</CardHeader>
      <CardBody>
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
            <a href="./#/serverConfiguration/log">Server Log</a>
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
              return (
                <tr key={index}>
                  <td>
                    <Creatable
                      menuPortalTarget={document.body}
                      options={availablePaths}
                      value={{ value: path, label: path }}
                      onChange={(e) => {
                        dispatch({
                          type: SOURCEPRIOS_PATH_CHANGED,
                          data: { path: e?.value || '', index }
                        })
                      }}
                    />
                  </td>
                  <td>
                    <PrefsEditor
                      key={path}
                      path={path}
                      priorities={priorities}
                      pathIndex={index}
                      isSaving={saveState.isSaving}
                    />
                  </td>
                  <td style={{ border: 'none' }}>
                    {index < sourcePriorities.length && (
                      <i
                        className="fas fa-trash"
                        onClick={() =>
                          dispatch({
                            type: SOURCEPRIOS_PATH_DELETED,
                            data: {
                              index
                            }
                          })
                        }
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </CardBody>
      <CardFooter>
        <Button
          size="sm"
          color="primary"
          disabled={
            !saveState.dirty || saveState.isSaving || !saveState.timeoutsOk
          }
          onClick={handleSave}
        >
          <i className="fa fa-save" /> Save
        </Button>
        {saveState.saveFailed && 'Saving priorities settings failed!'}
        {!saveState.timeoutsOk && (
          <span style={{ paddingLeft: '10px' }}>
            <Badge color="danger">Error</Badge>
            {
              'The timeout values need to be numbers in ascending order, please fix.'
            }
          </span>
        )}
      </CardFooter>
    </Card>
  )
}

export default SourcePriorities
