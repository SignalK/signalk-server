import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Col } from 'reactstrap'

import Webapp from './Webapp'

class Webapps extends Component {
  render () {
    return (
      <div className='row animated fadeIn'>
        {this.props.webapps.map(webappInfo => {
          return (
            <Col xs='12' md='12' lg='6' xl='4'>
            <Webapp
              key={webappInfo.name}
              header={webappInfo.name}
              mainText={webappInfo.description}
              url={`/${webappInfo.name}`}
              icon='fa fa-external-link'
              color='primary'
            />
            </Col>
          )
        })}
      </div>
    )
  }
}

const mapStateToProps = ({ webapps }) => ({ webapps })

export default connect(mapStateToProps)(Webapps)
