import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Card, CardBody, CardFooter } from 'reactstrap'
import classNames from 'classnames'
import { mapToCssModules } from 'reactstrap/lib/utils'

const propTypes = {
  header: PropTypes.string,
  mainText: PropTypes.string,
  icon: PropTypes.string,
  color: PropTypes.string,
  variant: PropTypes.string,
  footer: PropTypes.bool,
  link: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
  cssModule: PropTypes.object,
  bgImage: PropTypes.string,
}

const defaultProps = {
  header: '$1,999.50',
  mainText: 'Income',
  icon: 'fa fa-cogs',
  color: 'primary',
  variant: '0',
  link: '#',
  bgImage: '',
}

class Widget02 extends Component {
  render() {
    const {
      className,
      cssModule,
      header,
      mainText,
      url,
      icon,
      color,
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
            lead: 'pt-3',
          }
        : { card: 'p-0', icon: 'p-4 px-5', lead: 'pt-3' }

    const card = { style: 'clearfix', color: color, icon: icon, classes: '' }
    card.classes = mapToCssModules(
      classNames(className, card.style, padding.card),
      cssModule
    )

    const lead = { style: 'h5 mb-0', color: color, classes: '' }
    lead.classes = classNames(
      lead.style,
      'text-' + card.color,
      padding.lead,
      'text-capitalize'
    )

    const blockIcon = function (icon, bgImage = null) {
      const classes = classNames(
        icon,
        'bg-' + card.color,
        padding.icon,
        'font-2xl mr-3 float-left'
      )
      const style = {
        backgroundSize: 'cover',
        backgroundImage: bgImage ? `url(${bgImage})` : 'unset',
      }
      if (bgImage) {
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
            {blockIcon(
              card.icon,
              this.props.bgImage && `${this.props.url}/${this.props.bgImage}`
            )}
            <div className={lead.classes}>{header}</div>
            <div className="text-muted font-xs">{mainText}</div>
          </CardBody>
          {cardFooter()}
        </Card>
      </a>
    )
  }
}

Widget02.propTypes = propTypes
Widget02.defaultProps = defaultProps

export default Widget02
