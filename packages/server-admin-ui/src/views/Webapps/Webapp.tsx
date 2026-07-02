import { ReactNode } from 'react'
import Card from 'react-bootstrap/Card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells'
import classNames from 'classnames'
import { toSafeModuleId } from './dynamicutilities'

const ICON_BOX_SIZE = '72px'

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
    : `/${webAppInfo.name}/`
}

export default function Webapp({ webAppInfo, ...attributes }: WebappProps) {
  const padding = { card: 'p-3', icon: 'p-3', lead: 'mt-2' }

  const card = {
    style: 'clearfix',
    color: 'primary'
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
  const appIcon = webAppInfo?.signalk?.appIcon
  const hasDisplayName = !!webAppInfo?.signalk?.displayName

  const blockIcon = function () {
    // A real icon renders on a transparent box so the card shows through its
    // transparent areas; the primary colour is reserved for the placeholder.
    const classes = classNames(
      !appIcon && 'bg-primary',
      padding.icon,
      'font-2xl me-3 float-start'
    )
    const style: React.CSSProperties = {
      backgroundSize: 'cover',
      backgroundImage: appIcon
        ? `url(/${webAppInfo.name}/${appIcon})`
        : 'unset',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
    if (appIcon) {
      style.width = style.height = ICON_BOX_SIZE
    }
    return (
      <span className={classes} style={style}>
        {!appIcon && !hasDisplayName && <FontAwesomeIcon icon={faTableCells} />}
      </span>
    )
  }

  return (
    <a href={url}>
      <Card>
        <Card.Body className={card.style} {...attributes}>
          {blockIcon()}
          <div className={lead.classes}>{header}</div>
          <div className="text-muted font-xs">{webAppInfo.description}</div>
        </Card.Body>
      </Card>
    </a>
  )
}
