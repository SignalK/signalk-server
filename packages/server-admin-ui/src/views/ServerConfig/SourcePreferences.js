import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Card, CardHeader, CardBody, CardFooter, Table } from 'reactstrap'

const PrefsEditor = ({ priorities }) => {
  return (
    <Table>
      <thead>
        <tr>
          <td>sourceRef</td>
          <td>timeout</td>
        </tr>
      </thead>
      <tbody>
        {priorities.map(({ sourceRef, timeout }) => {
          return (
            <tr key={sourceRef}>
              <td>{sourceRef}</td>
              <td>{timeout} ms</td>
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
                    <td>{path}</td>
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
