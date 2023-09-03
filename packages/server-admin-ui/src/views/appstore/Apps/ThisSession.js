import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Row,
  Col,
  Card,
  CardHeader,
  CardBody,
  Table,
  Pagination,
  PaginationItem,
  PaginationLink,
  Progress,
} from 'reactstrap'

class ThisSession extends Component {
  render() {
    var thisSessionApps = this.props.installingApps
    if (thisSessionApps && thisSessionApps.length) {
      return (
        <div>
          <Card>
            <CardHeader>
              <i className="fa fa-align-justify" /> Activity This Session
              (restart server when completed!)
            </CardHeader>
            <CardBody>
              <Table responsive bordered striped size="sm">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Version</th>
                    <th>Description</th>
                    <th>Author</th>
                    <th>NPM</th>
                  </tr>
                </thead>
                <tbody>
                  {thisSessionApps.map((app) => {
                    var status
                    var progress = ''
                    if (app.isInstalling || app.isRemoving || app.isWaiting) {
                      status = app.isRemove ? 'Removing' : 'Installing'
                      progress = (
                        <Progress
                          className="progress-sm"
                          animated
                          color="success"
                          value="100"
                        />
                      )
                    } else if (app.installFailed) {
                      status = 'Failed'
                    } else {
                      status = 'Installed '
                      status = app.isRemove ? 'Removed' : 'Installed'
                    }

                    return (
                      <tr key={app.name}>
                        <td>
                          {status}
                          {progress}
                        </td>
                        <td>{app.name}</td>
                        <td>{app.version}</td>
                        <td>{app.description}</td>
                        <td>{app.author}</td>
                        <td>
                          <a href={app.npmUrl}>npm</a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )
    } else {
      return ''
    }
  }
}

export default ThisSession
