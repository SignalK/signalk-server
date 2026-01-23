import { useMemo, Suspense, createElement, ComponentType } from 'react'
import { useAppSelector } from '../../store'
import { Card, CardBody, CardHeader, Col } from 'reactstrap'
import { ADDON_PANEL, toLazyDynamicComponent } from './dynamicutilities'
import Webapp from './Webapp'

interface WebAppInfo {
  name: string
  description?: string
  keywords?: string[]
  signalk?: {
    displayName?: string
    appIcon?: string
  }
}

interface AddonModule {
  name: string
}

interface AddonPanelProps {
  webapps: WebAppInfo[]
  addons: AddonModule[]
}

export default function Webapps() {
  const webapps = useAppSelector((state) => state.webapps) as WebAppInfo[]
  const addons = useAppSelector((state) => state.addons) as AddonModule[]

  // Create lazy components when addons change - useMemo ensures stable references
  // Keep addon name with component for stable keys
  const addonComponents = useMemo(
    () =>
      addons.map((md) => ({
        name: md.name,
        Component: toLazyDynamicComponent(
          md.name,
          ADDON_PANEL
        ) as ComponentType<AddonPanelProps>
      })),
    [addons]
  )

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
          {addonComponents.map(({ name, Component }) => (
            <Suspense key={name} fallback="Loading...">
              {createElement(Component, { webapps, addons })}
            </Suspense>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
