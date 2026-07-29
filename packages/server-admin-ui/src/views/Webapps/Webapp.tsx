import { ReactNode } from 'react'
import Card from 'react-bootstrap/Card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells'
import classNames from 'classnames'
import { toSafeModuleId } from './dynamicutilities'

const ICON_BOX_SIZE = '72px'
// Match the Appstore's PluginIcon so a webapp tile and a plugin tile read
// as the same mark.
const ICON_BORDER_RADIUS = 8
const HEADER_MAX_LINES = 1
const DESCRIPTION_MAX_LINES = 3
const TEXT_LINE_HEIGHT = 1.4

// Clamp to a fixed number of lines, ellipsising whatever overflows. The line
// box is also *reserved*: the height is spelled out rather than left to the
// content, so a card with a one-line description is exactly as tall as one
// with an overflowing description.
function clampToLines(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
    lineHeight: TEXT_LINE_HEIGHT,
    height: `${lines * TEXT_LINE_HEIGHT}em`
  }
}

const headerStyle = clampToLines(HEADER_MAX_LINES)
const descriptionStyle = clampToLines(DESCRIPTION_MAX_LINES)

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
  onLaunch?: () => void
  children?: ReactNode
}

export function urlToWebapp(webAppInfo: WebAppInfo): string {
  return webAppInfo.keywords?.includes('signalk-embeddable-webapp')
    ? `/admin/#/e/${toSafeModuleId(webAppInfo.name)}`
    : `/${webAppInfo.name}/`
}

export default function Webapp({
  webAppInfo,
  onLaunch,
  ...attributes
}: WebappProps) {
  const padding = { card: 'p-3', icon: 'p-3' }

  const card = {
    style: 'clearfix',
    color: 'primary'
  }

  const lead = { style: 'h5 mb-0', color: card.color, classes: '' }
  lead.classes = classNames(lead.style, 'text-' + card.color, 'text-capitalize')
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
      justifyContent: 'center',
      borderRadius: ICON_BORDER_RADIUS,
      overflow: 'hidden'
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
    <a href={url} onClick={onLaunch}>
      <Card>
        <Card.Body className={card.style} {...attributes}>
          {blockIcon()}
          <div className={lead.classes} style={headerStyle}>
            {header}
          </div>
          <div className="text-muted font-xs" style={descriptionStyle}>
            {webAppInfo.description}
          </div>
        </Card.Body>
      </Card>
    </a>
  )
}
