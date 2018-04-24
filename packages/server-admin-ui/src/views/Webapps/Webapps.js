import React, { Component } from 'react'
import { connect } from 'react-redux'

import Webapp from './Webapp'

class Webapps extends Component {
  render () {
    return (
      <div className='animated fadeIn'>
        {this.props.webapps.map(webappInfo => {
          return (
            <Webapp
              key={webappInfo.name}
              header={webappInfo.description}
              mainText={`${webappInfo.name} ${webappInfo.version}`}
              url={`/${webappInfo.name}`}
              icon='fa fa-external-link'
              color='primary'
            />
          )
        })}
      </div>
    )
  }
}

const mapStateToProps = ({ webapps }) => ({ webapps })

export default connect(mapStateToProps)(Webapps)
