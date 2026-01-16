import React, { useState, useEffect, Suspense } from 'react'
import { useSelector } from 'react-redux'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'
import { ADDON_PANEL, toLazyDynamicComponent } from './dynamicutilities'

import Webapp from './Webapp'

const Webapps = () => {
  const webapps = useSelector((state) => state.webapps)
  const addons = useSelector((state) => state.addons)
  const [addonComponents, setAddonComponents] = useState([])

  useEffect(() => {
    setAddonComponents(
      addons.map((md) => toLazyDynamicComponent(md.name, ADDON_PANEL))
    )
  }, [addons])

  return (
    <div className="animated fadeIn">
      <Card>
        <CardHeader>Webapps</CardHeader>
        <CardBody>
          <div className="row">
            {webapps
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
          {addonComponents.map((c, i) => (
            <Suspense key={i} fallback="Loading...">
              {React.createElement(c, { webapps, addons })}
            </Suspense>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}

export default Webapps
