import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Card, CardBody } from 'reactstrap'
import classNames from 'classnames'
import { toSafeModuleId } from './dynamicutilities'

const propTypes = {
  webAppInfo: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    signalk: PropTypes.shape({
      displayName: PropTypes.string,
      appIcon: PropTypes.string
    })
  }).isRequired,
  children: PropTypes.node
}

export function urlToWebapp(webAppInfo) {
  return webAppInfo.keywords.includes('signalk-embeddable-webapp')
    ? `/admin/#/e/${toSafeModuleId(webAppInfo.name)}`
    : `/${webAppInfo.name}`
}

class Webapp extends Component {
  render() {
    const { webAppInfo, ...attributes } = this.props

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

    const blockIcon = function (icon, appIcon = null) {
      const classes = classNames(
        icon,
        'bg-primary',
        padding.icon,
        'font-2xl me-3 float-start'
      )
      const style = {
        backgroundSize: 'cover',
        backgroundImage: appIcon
          ? `url(/${webAppInfo.name}/${appIcon})`
          : 'unset'
      }
      if (appIcon) {
        style.width = style.height = '72px'
      }
      return <i className={classes} style={style} />
    }

    return (
      <a href={url}>
        <Card>
          <CardBody className={card.classes} {...attributes}>
            {blockIcon(card.icon, webAppInfo?.signalk?.appIcon)}
            <div className={lead.classes}>{header}</div>
            <div className="text-muted font-xs">{webAppInfo.description}</div>
          </CardBody>
        </Card>
      </a>
    )
  }
}

Webapp.propTypes = propTypes

export default Webapp
