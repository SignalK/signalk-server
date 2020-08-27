import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Card, CardHeader, CardBody, CardFooter, Input, Table } from 'reactstrap'

const PrefsEditor = ({ priorities }) => {
  return (
    <Table>
      <thead>
        <tr>
          <td>sourceRef</td>
          <td>timeout (ms)</td>
        </tr>
      </thead>
      <tbody>
        {[...priorities, {sourceRef: '', timeout: ''}].map(({ sourceRef, timeout }, i) => {
          return (
            <tr key={i}>
              <td>
                <Input
                  type='text'
                  name='sourceRef'
                  onChange={() => {}}
                  value={sourceRef}
                />

              </td>
              <td>
              <Input
                  type='number'
                  name='timeout'
                  onChange={() => {}}
                  value={timeout}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

class SourcePreferences extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    const sourcePriorities = Object.keys(
      this.props.sourcePriorities
    ).map(key => [key, this.props.sourcePriorities[key]])
    sourcePriorities.push(['', []])
    return (
      <Card>
        <CardHeader>Source Preferences</CardHeader>
        <CardBody>
          <Table responsive bordered striped size="sm">
            <thead>
              <tr>
                <th>Path</th>
                <th>Priorities</th>
              </tr>
            </thead>
            <tbody>
              {sourcePriorities.map(([path, priorities]) => {
                return (
                  <tr key={path}>
                    <td>
                      <Input
                        type='text'
                        name='path'
                        onChange={this.handleChange}
                        value={path}
                      />
                    </td>
                    <td>
                      <PrefsEditor priorities={priorities} />
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
