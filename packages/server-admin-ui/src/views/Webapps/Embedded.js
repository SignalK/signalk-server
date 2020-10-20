import React, { Component, Suspense } from 'react'
import { connect } from 'react-redux'
import { toLazyDynamicComponent } from './dynamicutilities'

class Embedded extends Component {
  constructor(props) {
    super(props)
    this.state = {
      component: toLazyDynamicComponent(this.props.match.params.moduleId, './AppPanel')
    }
  }

  render() {
    return (
      <div style={{ backgroundColor: 'aliceblue', height: 'calc(100vh - 105px)'}}>
        <Suspense fallback='Loading...'>
          {React.createElement(this.state.component, { ...this.props })}
        </Suspense>
      </div>

    )
  }
}

const mapStateToProps = ({ webapps }) => ({ webapps })

export default connect(mapStateToProps)(Embedded)

