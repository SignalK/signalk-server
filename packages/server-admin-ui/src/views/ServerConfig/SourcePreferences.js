import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Card, CardHeader, CardBody, CardFooter, Collapse, Input, Table } from 'reactstrap'
import { remove } from 'lodash'

export const SOURCEPRIOS_PRIO_CHANGED = 'SOURCEPRIOS_PPRIO_CHANGED'

export const handleSourcePriorityPriorityChanged = (state, action) => {
  const { pathIndex, sourceRef, timeout, index } = action.data
  const sourcePriorities = JSON.parse(JSON.stringify(state.sourcePriorities))
  if (pathIndex === sourcePriorities.length) {
    sourcePriorities.push({ path: '', priorities: [] })
  }

  const prios = sourcePriorities[pathIndex].priorities
  if (index === prios.length) {
    prios.push({ sourceRef: '', timeout: '' })
  }
  prios[index] = { sourceRef, timeout }
  return {
    ...state,
    sourcePriorities
  }
}

export const SOURCEPRIOS_PRIO_DELETED = 'SOURCEPRIOS_PRIO_DELETED'

export const handleSourcePriorityPriorityDeleted = (state, action) => {
  const { pathIndex, index } = action.data
  const sourcePriorities = JSON.parse(JSON.stringify(state.sourcePriorities))
  const prios = sourcePriorities[pathIndex].priorities
  remove(prios, (_, i) => i === index)
  return {
    ...state,
    sourcePriorities
  }

}

class PrefsEditor extends Component {
  constructor(props) {
    super(props)
    this.state = { isOpen: false }
  }

  render() {
    const toggleEditor = () => this.setState(state => ({ isOpen: !state.isOpen }))
    return (
      <div>
        {!this.state.isOpen && <div onClick={toggleEditor}>...</div>}
        <Collapse isOpen={this.state.isOpen}>
          <Table>
            <thead onClick={toggleEditor}>
              <tr>
                <td>sourceRef</td>
                <td>timeout (ms)</td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {[...this.props.priorities, { sourceRef: '', timeout: '' }].map(({ sourceRef, timeout }, index) => {
                return (
                  <tr key={index}>
                    <td>
                      <Input
                        type='text'
                        name='sourceRef'
                        onChange={(e) => this.props.dispatch({
                          type: SOURCEPRIOS_PRIO_CHANGED,
                          data: {
                            pathIndex: this.props.pathIndex,
                            sourceRef: e.target.value,
                            timeout,
                            index
                          }
                        })}
                        value={sourceRef}
                      />

                    </td>
                    <td>
                      <Input
                        type='number'
                        name='timeout'
                        onChange={(e) => this.props.dispatch({
                          type: SOURCEPRIOS_PRIO_CHANGED,
                          data: {
                            pathIndex: this.props.pathIndex,
                            sourceRef,
                            timeout: e.target.value,
                            index
                          }
                        })}
                        value={timeout}
                      />
                    </td>
                    <td>{index < this.props.priorities.length &&
                      <i
                        className='fas fa-trash'
                        onClick={() => this.props.dispatch({
                          type: SOURCEPRIOS_PRIO_DELETED,
                          data: {
                            pathIndex: this.props.pathIndex,
                            index
                          }
                        })}
                      />}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Collapse>
      </div>
    )
  }
}

export const SOURCEPRIOS_PATH_CHANGED = 'SOURCEPRIOS_PATH_CHANGED'

export const handleSourcePriorityPathChanged = (state, action) => {
  const { path, index } = action.data
  const sourcePriorities = JSON.parse(JSON.stringify(state.sourcePriorities))
  if (index === sourcePriorities.length) {
    sourcePriorities.push({ path: '', priorities: [] })
  }
  sourcePriorities[index].path = path
  return {
    ...state,
    sourcePriorities
  }
}

export const SOURCEPRIOS_PATH_DELETED = 'SOURCEPRIOS_PATH_DELETED'

export const handleSourcePriorityPathDeleted = (state, action) => {
  const { index } = action.data
  const sourcePriorities = JSON.parse(JSON.stringify(state.sourcePriorities))
  remove(sourcePriorities, (_, i) => i === index)
  return {
    ...state,
    sourcePriorities
  }
}


class SourcePreferences extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    const sourcePriorities = [].concat(this.props.sourcePriorities)
    sourcePriorities.push({ path: '', priorities: [] })
    return (
      <Card>
        <CardHeader>Source Preferences</CardHeader>
        <CardBody>
          <Table responsive bordered striped size="sm">
            <thead>
              <tr>
                <th>Path</th>
                <th>Priorities</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sourcePriorities.map(({ path, priorities }, index) => {
                return (
                  <tr key={index}>
                    <td>
                      <Input
                        type='text'
                        name='path'
                        onChange={(e) => this.props.dispatch({
                          type: SOURCEPRIOS_PATH_CHANGED,
                          data: { path: e.target.value, index }
                        })}
                        value={path}
                      />
                    </td>
                    <td>
                      <PrefsEditor priorities={priorities} dispatch={this.props.dispatch} pathIndex={index} />
                    </td>
                    <td>
                      <td style={{ border: 'none' }}>{index < this.props.sourcePriorities.length &&
                        <i
                          className='fas fa-trash'
                          onClick={() => this.props.dispatch({
                            type: SOURCEPRIOS_PATH_DELETED,
                            data: {
                              index
                            }
                          })}
                        />} </td>

                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </CardBody>
        <CardFooter></CardFooter>
      </Card>
    )
  }
}

const mapStateToProps = ({ sourcePriorities }) => ({ sourcePriorities })

export default connect(mapStateToProps)(SourcePreferences)
