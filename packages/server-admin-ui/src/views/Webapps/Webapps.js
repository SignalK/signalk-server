import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'

import Webapp from './Webapp'

const AddonPanel = React.lazy(() => new Promise((resolve) => {
  const container = window.addon_demo;
  container.init(__webpack_share_scopes__.default)
  const module = container.get('./AddonPanel')
  module.then(factory => {
    resolve(factory())
  })
}));


class Webapps extends Component {
  constructor(props) {
    super(props)
    this.state = {
      count: 314
    }
  }

  render() {
    return (
      <div className='animated fadeIn'>
        <Card>
          <CardHeader>Webapps</CardHeader>
          <CardBody>
            <div className='row'>
            {this.props.webapps
              .filter(webAppInfo => webAppInfo.name !== '@signalk/server-admin-ui')
              .map(webappInfo => {
                return (
                  <Col xs='12' md='12' lg='6' xl='4' key={webappInfo.name}>
                    <Webapp
                      key={webappInfo.name}
                      header={webappInfo.name}
                      mainText={webappInfo.description}
                      url={`/${webappInfo.name}`}
                      icon='fa fa-external-link'
                      color='primary'
                    />
                  </Col>
                )
              })}
              </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Addons</CardHeader>
          <CardBody>
            <Suspense fallback='Loading...'>
              <AddonPanel {...this.props}/>
            </Suspense>
          </CardBody>
        </Card>
      </div>
    )
  }
}

const mapStateToProps = ({ webapps }) => ({ webapps })

export default connect(mapStateToProps)(Webapps)
