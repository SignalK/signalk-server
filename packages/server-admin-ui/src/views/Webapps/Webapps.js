import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'

import Webapp from './Webapp'

const toLazyAddonComponent = (moduleData) => React.lazy(() => new Promise((resolve) => {
  const container = window[moduleData.name.replace(/-/g, '_')];
  container.init(__webpack_share_scopes__.default)
  const module = container.get('./AddonPanel')
  module.then(factory => {
    resolve(factory())
  })
}))

class Webapps extends Component {
  constructor(props) {
    super(props)
    this.state = {
      addonComponents: []
    }
  }

  componentDidMount() {
    this.setState({
      addonComponents: this.props.addons.map(toLazyAddonComponent)
    })
  }

  componentDidUpdate(prevProps) {
    if (this.props.addons != prevProps.addons) {
      this.setState({
        addonComponents: this.props.addons.map(toLazyAddonComponent)
      })
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
            {this.state.addonComponents.map((c,i) => (
              <Suspense key={i} fallback='Loading...'>
                {React.createElement(c, {...this.props})}
              </Suspense>
            ))}
          </CardBody>
        </Card>
      </div>
    )
  }
}

const mapStateToProps = ({ webapps, addons }) => ({ webapps, addons })

export default connect(mapStateToProps)(Webapps)
