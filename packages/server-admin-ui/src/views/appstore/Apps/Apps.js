import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Button, Card, CardHeader, CardBody } from 'reactstrap'
import ThisSession from './ThisSession'
import AppsList from './AppsList'

const viewParams = {
  apps: {
    listName: 'available',
    title: 'Available Apps'
  },
  installed: {
    listName: 'installed',
    title: 'Installed Apps'
  },
  updates: {
    listName: 'updates',
    title: 'Available Updates'
  }
}

class AppTable extends Component {
  render () {
    const viewData = viewParams[this.props.match.params.view]
    return (
      <div className='animated fadeIn'>
        <ThisSession installingApps={this.props.appStore.installing} />
        {!this.props.appStore.storeAvailable && (
          <Card className='border-warning'>
            <CardHeader>Appstore not available</CardHeader>
            <CardBody>
              You probably don't have Internet connectivity and Appstore can not
              be reached.
            </CardBody>
          </Card>
        )}
        {this.props.appStore.storeAvailable && (
          <Card>
            <CardHeader>
              <i className='fa fa-align-justify' /> {viewData.title}
            </CardHeader>
            <CardBody>
              <AppsList
                apps={this.props.appStore[viewData.listName]}
                storeAvailable={this.props.appStore.storeAvailable}
                listName={viewData.listName}
              />
            </CardBody>
          </Card>
        )}
      </div>
    )
  }
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(AppTable)
