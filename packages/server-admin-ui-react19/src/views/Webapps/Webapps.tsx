import {
  useEffect,
  useMemo,
  Suspense,
  createElement,
  ComponentType
} from 'react'
import { useWebapps, useAddons } from '../../store'
import { fetchWebapps } from '../../actions'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
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
  const webapps = useWebapps() as WebAppInfo[]
  const addons = useAddons() as AddonModule[]

  useEffect(() => {
    fetchWebapps()
  }, [])

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
        <Card.Header>Webapps</Card.Header>
        <Card.Body>
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
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>Addons</Card.Header>
        <Card.Body>
          {addonComponents.map(({ name, Component }) => (
            <Suspense key={name} fallback="Loading...">
              {createElement(Component, { webapps, addons })}
            </Suspense>
          ))}
        </Card.Body>
      </Card>
    </div>
  )
}
