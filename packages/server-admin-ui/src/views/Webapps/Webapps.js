import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'
import {
  ADDON_PANEL,
  toLazyDynamicComponent,
  toSafeModuleId
} from './dynamicutilities'

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
    this.setAddonComponents()
  }

  componentDidUpdate(prevProps) {
    if (this.props.addons != prevProps.addons) {
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
                .map((webappInfo) => {
                  const url = webappInfo.keywords.includes(
                    'signalk-embeddable-webapp'
                  )
                    ? `/admin/#/e/${toSafeModuleId(webappInfo.name)}`
                    : `/${webappInfo.name}`
                  return (
                    <Col xs="12" md="12" lg="6" xl="4" key={webappInfo.name}>
                      <Webapp
                        key={webappInfo.name}
                        header={
                          webappInfo.signalk && webappInfo.signalk.displayName
                            ? webappInfo.signalk.displayName
                            : webappInfo.name
                        }
                        mainText={webappInfo.description}
                        url={url}
                        icon={`fa ${
                          webappInfo.signalk && webappInfo.signalk.displayName
                            ? ''
                            : 'icon-grid'
                        }`}
                        color="primary"
                        bgImage={
                          webappInfo.signalk && webappInfo.signalk.appIcon
                            ? webappInfo.signalk.appIcon
                            : undefined
                        }
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
