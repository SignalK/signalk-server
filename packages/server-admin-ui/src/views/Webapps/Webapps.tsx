import {
  useState,
  useEffect,
  useMemo,
  Suspense,
  createElement,
  ComponentType
} from 'react'
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

interface DeprecatedApp {
  name: string
  deprecatedMessage?: string
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
  const deprecatedApps = useAppSelector(
    (state) => state.appStore?.deprecated || []
  ) as DeprecatedApp[]
  const [addonComponents, setAddonComponents] = useState<
    ComponentType<AddonPanelProps>[]
  >([])

  // Create a map for quick lookup of deprecated webapp messages
  const deprecatedMap = useMemo(() => {
    const map = new Map<string, string>()
    deprecatedApps.forEach((app) => {
      if (app.deprecatedMessage) {
        map.set(app.name, app.deprecatedMessage)
      }
    })
    return map
  }, [deprecatedApps])

  useEffect(() => {
    setAddonComponents(
      addons.map(
        (md) =>
          toLazyDynamicComponent(
            md.name,
            ADDON_PANEL
          ) as ComponentType<AddonPanelProps>
      )
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
                const deprecatedMessage = deprecatedMap.get(webAppInfo.name)
                return (
                  <Col xs="12" md="12" lg="6" xl="4" key={webAppInfo.name}>
                    <Webapp
                      key={webAppInfo.name}
                      webAppInfo={webAppInfo}
                      deprecatedMessage={deprecatedMessage}
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
          {addonComponents.map((c, i) => (
            <Suspense key={i} fallback="Loading...">
              {createElement(c, { webapps, addons })}
            </Suspense>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
