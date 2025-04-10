import React, { Component } from 'react'
import { connect } from 'react-redux'
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
  Table,
} from 'reactstrap'
import Creatable from 'react-select/creatable/dist/react-select.esm.js'
import remove from 'lodash.remove'
import uniq from 'lodash.uniq'

export const SOURCEPRIOS_PRIO_CHANGED = 'SOURCEPRIOS_PPRIO_CHANGED'
export const SOURCEPRIOS_PRIO_DELETED = 'SOURCEPRIOS_PRIO_DELETED'
export const SOURCEPRIOS_PRIO_MOVED = 'SOURCEPRIOS_PRIO_MOVED'

export const SOURCEPRIOS_PATH_CHANGED = 'SOURCEPRIOS_PATH_CHANGED'
export const SOURCEPRIOS_PATH_DELETED = 'SOURCEPRIOS_PATH_DELETED'

export const SOURCEPRIOS_SAVING = 'SOURCEPRIOS_SAVING'
export const SOURCEPRIOS_SAVED = 'SOURCEPRIOS_SAVED'
export const SOURCEPRIOS_SAVE_FAILED = 'SOURCEPRIOS_SAVE_FAILED'
export const SOURCEPRIOS_SAVE_FAILED_OVER = 'SOURCEPRIOS_SAVE_FAILED_OVER'

function checkTimeouts(sourcePriorities) {
  return sourcePriorities.reduce((acc, prio, i) => {
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

export const reduceSourcePriorities = (state, action) => {
  const sourcePriorities = JSON.parse(JSON.stringify(state.sourcePriorities))
  let saveState = { ...state.saveState }
  const { path, index, pathIndex, sourceRef, timeout, change } =
    action.data || {}
  const prios =
    pathIndex !== undefined ? sourcePriorities[pathIndex].priorities : undefined

  switch (action.type) {
    case SOURCEPRIOS_PATH_CHANGED:
      if (index === sourcePriorities.length) {
        sourcePriorities.push({ path: '', priorities: [] })
      }
      sourcePriorities[index].path = path
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
      if (index === prios.length) {
        prios.push({ sourceRef: '', timeout: '' })
      }
      prios[index] = { sourceRef, timeout }
      saveState.dirty = true
      saveState.timeoutsOk = checkTimeouts(prios)
      break

    case SOURCEPRIOS_PRIO_DELETED:
      remove(prios, (_, i) => i === index)
      saveState.dirty = true
      break

    case SOURCEPRIOS_PRIO_MOVED:
      // eslint-disable-next-line no-case-declarations
      const tmp = prios[index]
      prios[index] = prios[index + change]
      prios[index + change] = tmp
      saveState.dirty = true
      saveState.timeoutsOk = checkTimeouts(prios)
      break

    case SOURCEPRIOS_SAVING:
      saveState = {
        ...saveState,
        isSaving: true,
        saveFailed: false,
      }
      break

    case SOURCEPRIOS_SAVED:
      saveState = {
        ...saveState,
        dirty: false,
        isSaving: false,
        saveFailed: false,
      }
      break

    case SOURCEPRIOS_SAVE_FAILED:
      saveState = {
        ...saveState,
        isSaving: false,
        saveFailed: true,
      }
      break

    case SOURCEPRIOS_SAVE_FAILED_OVER:
      saveState = {
        ...saveState,
        saveFailed: false,
      }
      break

    default:
      return state
  }
  // common return statement
  return { sourcePriorities, saveState }
}

function fetchSourceRefs(path, cb) {
  fetch(`/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`, {
    credentials: 'include',
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

class PrefsEditor extends Component {
  constructor(props) {
    super(props)
    this.state = { isOpen: false, sourceRefs: [] }
    fetchSourceRefs(this.props.path, (sourceRefs) => {
      this.setState({ sourceRefs })
    })
  }

  componentDidUpdate(prevProps) {
    if (this.props.path !== prevProps.path) {
      fetchSourceRefs(this.props.path, (sourceRefs) => {
        this.setState({ sourceRefs })
      })
    }
  }

  render() {
    const toggleEditor = () =>
      this.setState((state) => ({ isOpen: !state.isOpen }))
    return (
      <div>
        {!this.state.isOpen && <div onClick={toggleEditor}>...</div>}
        <Collapse isOpen={this.state.isOpen}>
          <Table>
            <thead onClick={toggleEditor}>
              <tr>
                <td style={{ width: '30px' }}>#</td>
                <td>Source Reference (see DataBrowser for details)</td>
                <td style={{ width: '120px' }}>Timeout (ms)</td>
                <td style={{ Width: '80px' }}>Order</td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {[...this.props.priorities, { sourceRef: '', timeout: '' }].map(
                ({ sourceRef, timeout }, index) => {
                  const options = this.state.sourceRefs.map((sourceRef) => ({
                    label: sourceRef,
                    value: sourceRef,
                  }))
                  return (
                    <tr key={index}>
                      <td>{index + 1}.</td>
                      <td>
                        <Creatable
                          menuPortalTarget={document.body}
                          options={options}
                          value={{ value: sourceRef, label: sourceRef }}
                          onChange={(e) => {
                            this.props.dispatch({
                              type: SOURCEPRIOS_PRIO_CHANGED,
                              data: {
                                pathIndex: this.props.pathIndex,
                                sourceRef: e.value,
                                timeout,
                                index,
                              },
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
                              this.props.dispatch({
                                type: SOURCEPRIOS_PRIO_CHANGED,
                                data: {
                                  pathIndex: this.props.pathIndex,
                                  sourceRef,
                                  timeout: e.target.value,
                                  index,
                                },
                              })
                            }
                            value={timeout}
                          />
                        )}
                      </td>
                      <td>
                        {index > 0 && index < this.props.priorities.length && (
                          <button
                            onClick={() =>
                              !this.props.isSaving &&
                              this.props.dispatch({
                                type: SOURCEPRIOS_PRIO_MOVED,
                                data: {
                                  pathIndex: this.props.pathIndex,
                                  index,
                                  change: -1,
                                },
                              })
                            }
                          >
                            <i className="fas fa-arrow-up" />
                          </button>
                        )}
                        {index < this.props.priorities.length - 1 && (
                          <button
                            onClick={() =>
                              !this.props.isSaving &&
                              this.props.dispatch({
                                type: SOURCEPRIOS_PRIO_MOVED,
                                data: {
                                  pathIndex: this.props.pathIndex,
                                  index,
                                  change: 1,
                                },
                              })
                            }
                          >
                            <i className="fas fa-arrow-down" />
                          </button>
                        )}
                      </td>
                      <td>
                        {index < this.props.priorities.length && (
                          <i
                            className="fas fa-trash"
                            onClick={() =>
                              !this.props.isSaving &&
                              this.props.dispatch({
                                type: SOURCEPRIOS_PRIO_DELETED,
                                data: {
                                  pathIndex: this.props.pathIndex,
                                  index,
                                },
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
}

const sourcePrioritySave = (sourcePriorities) => (dispatch) => {
  dispatch({
    type: SOURCEPRIOS_SAVING,
  })
  fetch(`${window.serverRoutesPrefix}/sourcePriorities`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      sourcePriorities.reduce((acc, pathPriority) => {
        acc[pathPriority.path] = pathPriority.priorities
        return acc
      }, {})
    ),
  })
    .then((response) => {
      if (response.status === 200) {
        dispatch({
          type: SOURCEPRIOS_SAVED,
        })
      } else {
        throw new Error()
      }
    })
    .catch(() => {
      dispatch({
        type: SOURCEPRIOS_SAVE_FAILED,
      })
      setTimeout(
        () => dispatch({ type: SOURCEPRIOS_SAVE_FAILED_OVER }),
        5 * 1000
      )
    })
}

function fetchAvailablePaths(cb) {
  fetch(`${window.serverRoutesPrefix}/availablePaths`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then(cb)
}

class SourcePriorities extends Component {
  constructor(props) {
    super(props)
    this.state = {
      availablePaths: [],
    }
    fetchAvailablePaths((pathsArray) => {
      this.setState({
        availablePaths: pathsArray.map((path) => ({
          value: path,
          label: path,
        })),
      })
    })
  }

  render() {
    const sourcePriorities = [].concat(this.props.sourcePriorities)
    sourcePriorities.push({ path: '', priorities: [] })
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
                latest value for a path is from a higher priority source and it
                is not older than the timeout
              </b>{' '}
              specified for the source of the incoming data. Timeout for data
              from unlisted sources is 10 seconds.
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
              {sourcePriorities.map(({ path, priorities }, index) => {
                return (
                  <tr key={index}>
                    <td>
                      <Creatable
                        menuPortalTarget={document.body}
                        options={this.state.availablePaths}
                        value={{ value: path, label: path }}
                        onChange={(e) => {
                          this.props.dispatch({
                            type: SOURCEPRIOS_PATH_CHANGED,
                            data: { path: e.value, index },
                          })
                        }}
                      />
                    </td>
                    <td>
                      <PrefsEditor
                        key={path}
                        path={path}
                        priorities={priorities}
                        dispatch={this.props.dispatch}
                        isSaving={this.props.saveState.isSaving}
                        pathIndex={index}
                      />
                    </td>
                    <td style={{ border: 'none' }}>
                      {index < this.props.sourcePriorities.length && (
                        <i
                          className="fas fa-trash"
                          onClick={() =>
                            this.props.dispatch({
                              type: SOURCEPRIOS_PATH_DELETED,
                              data: {
                                index,
                              },
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
              !this.props.saveState.dirty ||
              this.props.saveState.isSaving ||
              !this.props.saveState.timeoutsOk
            }
            onClick={(e) => {
              e.preventDefault()
              this.props.dispatch(
                sourcePrioritySave(this.props.sourcePriorities)
              )
            }}
          >
            <i className="fa fa-save" /> Save
          </Button>
          {this.props.saveState.saveFailed &&
            'Saving priorities settings failed!'}
          {!this.props.saveState.timeoutsOk && (
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
}

const mapStateToProps = ({ sourcePrioritiesData }) => ({
  sourcePriorities: sourcePrioritiesData.sourcePriorities,
  saveState: sourcePrioritiesData.saveState,
})

export default connect(mapStateToProps)(SourcePriorities)
