import { ReactNode } from 'react'
import Badge from 'react-bootstrap/Badge'
import Card from 'react-bootstrap/Card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells'
import classNames from 'classnames'
import { toSafeModuleId } from './dynamicutilities'
import type { WebappStatus } from '../../store/types'

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
  status?: WebappStatus
  children?: ReactNode
}

export function urlToWebapp(webAppInfo: WebAppInfo): string {
  return webAppInfo.keywords?.includes('signalk-embeddable-webapp')
    ? `/admin/#/e/${toSafeModuleId(webAppInfo.name)}`
    : `/${webAppInfo.name}/`
}

export default function Webapp({
  webAppInfo,
  status,
  ...attributes
}: WebappProps) {
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
      'font-2xl'
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

  const errorCount = status?.errorCount ?? 0
  const warnCount = status?.warnCount ?? 0
  const statusBadge = (
    count: number,
    variant: 'danger' | 'warning',
    style: React.CSSProperties
  ) => (
    <Badge
      pill
      bg={variant}
      text={variant === 'warning' ? 'dark' : undefined}
      style={{ position: 'absolute', right: 0, ...style }}
    >
      {count}
    </Badge>
  )

  return (
    <a href={url}>
      <Card>
        <Card.Body className={card.style} {...attributes}>
          <span
            className="float-start me-3"
            style={{ position: 'relative', display: 'inline-block' }}
          >
            {blockIcon()}
            {errorCount > 0 &&
              statusBadge(errorCount, 'danger', {
                top: 0,
                transform: 'translate(40%, -40%)'
              })}
            {warnCount > 0 &&
              statusBadge(warnCount, 'warning', {
                bottom: 0,
                transform: 'translate(40%, 40%)'
              })}
          </span>
          <div className={lead.classes}>{header}</div>
          <div className="text-muted font-xs">{webAppInfo.description}</div>
        </Card.Body>
      </Card>
    </a>
  )
}
