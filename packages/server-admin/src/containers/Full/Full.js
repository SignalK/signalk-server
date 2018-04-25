import React, { Component } from 'react'
import { Link, Switch, Route, Redirect, withRouter } from 'react-router-dom'
import { Container } from 'reactstrap'
import { connect } from 'react-redux'

import Header from '../../components/Header/'
import Sidebar from '../../components/Sidebar/'
import Breadcrumb from '../../components/Breadcrumb/'
import Aside from '../../components/Aside/'
import Footer from '../../components/Footer/'

import Dashboard from '../../views/Dashboard/'
import Webapps from '../../views/Webapps/'
import Apps from '../../views/appstore/Apps/'
import Configuration from '../../views/Configuration'
import Login from '../../views/Login'
import Security from '../../views/Security'
import VesselConfiguration from '../../views/ServerConfig/VesselConfiguration'
import ProvidersConfiguration from '../../views/ServerConfig/ProvidersConfiguration'
import Settings from '../../views/ServerConfig/Settings'

import {
  fetchLoginStatus,
  fetchAllData,
  openServerEventsConnection
} from '../../actions'

class Full extends Component {
  componentDidMount () {
    const { dispatch } = this.props
    fetchAllData(dispatch)
    openServerEventsConnection(dispatch)
  }

  render () {
    return (
      <div className='app'>
        <Header />
        <div className='app-body'>
          <Sidebar {...this.props} />
          <main className='main'>
            <Breadcrumb />
            <Container fluid>
              <Switch>
                <Route
                  path='/dashboard'
                  name='Dashboard'
                  component={loginOrOriginal(Dashboard, true)}
                />
                <Route
                  path='/webapps'
                  name='Webapps'
                  component={loginOrOriginal(Webapps, true)}
                />
                <Route
                  path='/appstore/:view'
                  component={loginOrOriginal(Apps)}
                />
                <Route
                  path='/serverConfiguration/plugins'
                  component={loginOrOriginal(Configuration)}
                />
                <Route
                  path='/serverConfiguration/settings'
                  component={loginOrOriginal(Settings)}
                />
                <Route
                  path='/serverConfiguration/vessel'
                  component={loginOrOriginal(VesselConfiguration)}
                />
                <Route
                  path='/serverConfiguration/providers'
                  component={loginOrOriginal(ProvidersConfiguration)}
                />
                <Route path='/security' component={loginOrOriginal(Security)} />
                <Route path='/login' component={Login} />
                <Redirect from='/' to='/dashboard' />
              </Switch>
            </Container>
          </main>
          <Aside />
        </div>
        <Footer />
      </div>
    )
  }
}

export default connect()(Full)

const loginOrOriginal = (BaseComponent, componentSupportsReadOnly) => {
  class Restricted extends Component {
    render () {
      if (loginRequired(this.props.loginStatus, componentSupportsReadOnly)) {
        return <Login />
      } else {
        return <BaseComponent {...this.props} />
      }
    }
  }
  return connect(({ loginStatus }) => ({ loginStatus }))(withRouter(Restricted))
}

function loginRequired (loginStatus, componentSupportsReadOnly) {
  // component works with read only access and
  // server loginStatus allows read only access
  if (componentSupportsReadOnly && loginStatus.readOnlyAccess) {
    return false
  }

  // require login when server requires authentication AND
  // user is not logged
  return (
    loginStatus.authenticationRequired && loginStatus.status === 'notLoggedIn'
  )
}
