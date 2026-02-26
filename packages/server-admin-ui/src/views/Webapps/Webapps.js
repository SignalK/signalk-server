import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'
import { fetchWebapps } from '../../actions'
import { ADDON_PANEL, toLazyDynamicComponent } from './dynamicutilities'

import Webapp from './Webapp'

class Webapps extends Component {
  constructor(props) {
    super(props)
    this.state = {
      addonComponents: []
    }
  }

  setAddonComponents() {
    this.setState({
      addonComponents: this.props.addons.map((md) =>
        toLazyDynamicComponent(md.name, ADDON_PANEL)
      )
    })
  }

  componentDidMount() {
    fetchWebapps(this.props.dispatch)
    this.setAddonComponents()
  }

  componentDidUpdate(prevProps) {
    if (this.props.addons !== prevProps.addons) {
      this.setAddonComponents()
    }
  }

  render() {
    return (
      <div className="animated fadeIn">
        <Card>
          <CardHeader>Webapps</CardHeader>
          <CardBody>
            <div className="row">
              {this.props.webapps
                .filter(
                  (webAppInfo) => webAppInfo.name !== '@signalk/server-admin-ui'
                )
                .map((webAppInfo) => {
                  return (
                    <Col xs="12" md="12" lg="6" xl="4" key={webAppInfo.name}>
                      <Webapp key={webAppInfo.name} webAppInfo={webAppInfo} />
                    </Col>
                  )
                })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Addons</CardHeader>
          <CardBody>
            {this.state.addonComponents.map((c, i) => (
              <Suspense key={i} fallback="Loading...">
                {React.createElement(c, { ...this.props })}
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
