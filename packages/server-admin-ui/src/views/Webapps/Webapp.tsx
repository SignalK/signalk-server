import { ReactNode } from 'react'
import { Card, CardBody } from 'reactstrap'
import classNames from 'classnames'
import { toSafeModuleId } from './dynamicutilities'

interface SignalKInfo {
  displayName?: string
  appIcon?: string
}

interface WebAppInfo {
  name: string
  description?: string
  keywords?: string[]
  signalk?: SignalKInfo
}

interface WebappProps {
  webAppInfo: WebAppInfo
  children?: ReactNode
}

export function urlToWebapp(webAppInfo: WebAppInfo): string {
  return webAppInfo.keywords?.includes('signalk-embeddable-webapp')
    ? `/admin/#/e/${toSafeModuleId(webAppInfo.name)}`
    : `/${webAppInfo.name}`
}

export default function Webapp({ webAppInfo, ...attributes }: WebappProps) {
  const padding = { card: 'p-3', icon: 'p-3', lead: 'mt-2' }

  const card = {
    style: 'clearfix',
    color: 'primary',
    icon: `fa ${webAppInfo?.signalk?.displayName ? '' : 'icon-grid'}`
  }

  const lead = { style: 'h5 mb-0', color: card.color, classes: '' }
  lead.classes = classNames(
    lead.style,
    'text-' + card.color,
    padding.lead,
    'text-capitalize'
  )
  const header = webAppInfo?.signalk?.displayName || webAppInfo.name
  const url = urlToWebapp(webAppInfo)

  const blockIcon = function (icon: string, appIcon: string | null = null) {
    const classes = classNames(
      icon,
      'bg-primary',
      padding.icon,
      'font-2xl me-3 float-start'
    )
    const style: React.CSSProperties = {
      backgroundSize: 'cover',
      backgroundImage: appIcon ? `url(/${webAppInfo.name}/${appIcon})` : 'unset'
    }
    if (appIcon) {
      style.width = style.height = '72px'
    }
    return <i className={classes} style={style} />
  }

  return (
    <a href={url}>
      <Card>
        <CardBody className={card.style} {...attributes}>
          {blockIcon(card.icon, webAppInfo?.signalk?.appIcon || null)}
          <div className={lead.classes}>{header}</div>
          <div className="text-muted font-xs">{webAppInfo.description}</div>
        </CardBody>
      </Card>
    </a>
  )
}
