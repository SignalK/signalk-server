import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Card, CardBody, CardFooter } from 'reactstrap'
import classNames from 'classnames'
import { mapToCssModules } from 'reactstrap/lib/utils'
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
  variant: PropTypes.string,
  footer: PropTypes.bool,
  link: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
  cssModule: PropTypes.object
}

const defaultProps = {
  icon: 'fa fa-cogs',
  variant: '0',
  link: '#',
}

class Webapp extends Component {
  render() {
    const {
      webAppInfo,
      className,
      cssModule,
      footer,
      link,
      variant,
      ...attributes
    } = this.props

    // demo purposes only
    const padding =
      variant === '0'
        ? { card: 'p-3', icon: 'p-3', lead: 'mt-2' }
        : variant === '1'
          ? {
              card: 'p-0',
              icon: 'p-4',
              lead: 'pt-3'
            }
          : { card: 'p-0', icon: 'p-4 px-5', lead: 'pt-3' }

    const card = {
      style: 'clearfix',
      color: 'primary',
      icon: `fa ${webAppInfo?.signalk?.displayName ? '' : 'icon-grid'}`,
      classes: ''
    }
    card.classes = mapToCssModules(
      classNames(className, card.style, padding.card),
      cssModule
    )

    const lead = { style: 'h5 mb-0', color: card.color, classes: '' }
    lead.classes = classNames(
      lead.style,
      'text-' + card.color,
      padding.lead,
      'text-capitalize'
    )
    const header = webAppInfo?.signalk?.displayName || webAppInfo.name
    const url = webAppInfo.keywords.includes('signalk-embeddable-webapp')
      ? `/admin/#/e/${toSafeModuleId(webAppInfo.name)}`
      : `/${webAppInfo.name}`

    const blockIcon = function (icon, appIcon = null) {
      const classes = classNames(
        icon,
        'bg-primary',
        padding.icon,
        'font-2xl mr-3 float-left'
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

    const cardFooter = function () {
      if (footer) {
        return (
          <CardFooter className="px-3 py-2">
            <a
              className="font-weight-bold font-xs btn-block text-muted"
              href={link}
            >
              View More
              <i className="fa fa-angle-right float-right font-lg" />
            </a>
          </CardFooter>
        )
      }
    }

    return (
      <a href={url}>
        <Card>
          <CardBody className={card.classes} {...attributes}>
            {blockIcon(card.icon, webAppInfo?.signalk?.appIcon)}
            <div className={lead.classes}>{header}</div>
            <div className="text-muted font-xs">{webAppInfo.description}</div>
          </CardBody>
          {cardFooter()}
        </Card>
      </a>
    )
  }
}

Webapp.propTypes = propTypes
Webapp.defaultProps = defaultProps

export default Webapp
