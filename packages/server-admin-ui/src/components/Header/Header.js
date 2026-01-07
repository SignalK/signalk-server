import React, { Component } from 'react'
import {
  Nav,
  NavItem,
  NavLink,
  NavbarToggler,
  NavbarBrand,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Dropdown,
  Alert
} from 'reactstrap'
import { connect } from 'react-redux'
import { logout, restart, login } from '../../actions'

class Header extends Component {
  constructor(props) {
    super(props)

    this.toggleDropdown = this.toggleDropdown.bind(this)
    this.state = {
      dropdownOpen: false
    }

    // Bind event handlers so they can be removed in componentWillUnmount
    this.handleSidebarHide = this.handleSidebarHide.bind(this)
    this.handlePopstate = this.handlePopstate.bind(this)
  }

  handleSidebarHide() {
    document.body.classList.toggle('sidebar-hidden', true)
    document.body.classList.toggle('sidebar-mobile-show', false)
  }

  handlePopstate() {
    document.body.classList.toggle('sidebar-mobile-show', false)
  }

  componentDidMount() {
    window.addEventListener('sidebar:hide', this.handleSidebarHide)
    window.addEventListener('popstate', this.handlePopstate)
  }

  componentWillUnmount() {
    window.removeEventListener('sidebar:hide', this.handleSidebarHide)
    window.removeEventListener('popstate', this.handlePopstate)
  }

  toggleDropdown() {
    this.setState({
      dropdownOpen: !this.state.dropdownOpen
    })
  }

  sidebarToggle(e) {
    e.preventDefault()
    document.body.classList.toggle('sidebar-hidden')
  }

  sidebarMinimize(e) {
    e.preventDefault()
    document.body.classList.toggle('sidebar-minimized')
  }

  mobileSidebarToggle(e) {
    e.preventDefault()
    document.body.classList.toggle('sidebar-mobile-show')
  }

  asideToggle(e) {
    e.preventDefault()
    document.body.classList.toggle('aside-menu-hidden')
  }

  render() {
    return (
      <header className="app-header navbar">
        {this.props.backpressureWarning && (
          <Alert
            color="warning"
            className="backpressure-warning"
            style={{
              position: 'absolute',
              top: '55px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1050,
              margin: 0,
              padding: '8px 16px',
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            <i className="fa fa-exclamation-triangle" /> Network congestion
            detected – some updates were skipped. Check your connection.
          </Alert>
        )}
        <NavbarToggler className="d-lg-none" onClick={this.mobileSidebarToggle}>
          <span className="navbar-toggler-icon" />
        </NavbarToggler>
        <NavbarBrand href="#" />
        <NavbarToggler
          className="d-md-down-none mr-auto"
          onClick={this.sidebarToggle}
        >
          <span className="navbar-toggler-icon" />
        </NavbarToggler>
        <Nav className="ml-auto" navbar>
          <NavItem className="d-md-down-none px-3">
            {this.props.loginStatus.status === 'loggedIn' &&
              this.props.loginStatus.userLevel === 'admin' && (
                <NavLink href="#/" onClick={this.props.restart}>
                  {this.props.restarting ? (
                    <i className="fa fa-circle-o-notch text-danger fa-spin" />
                  ) : (
                    <i className="fa fa-circle-o-notch" />
                  )}{' '}
                  Restart
                </NavLink>
              )}
          </NavItem>
          {this.props.loginStatus.status === 'loggedIn' && (
            <NavItem className="d-md-down-none px-3">
              <NavLink href="#/" onClick={this.props.logout}>
                <i className="fa fa-lock" /> Logout
              </NavLink>
            </NavItem>
          )}
          {this.props.loginStatus.status !== 'loggedIn' &&
            this.props.loginStatus.authenticationRequired && (
              <NavItem className="d-md-down-none px-3">
                <NavLink href="#/login">
                  <i className="fa fa-lock" /> Login
                </NavLink>
              </NavItem>
            )}
          <div className="d-lg-none">
            <Dropdown
              nav
              isOpen={this.state.dropdownOpen}
              toggle={this.toggleDropdown}
            >
              <DropdownToggle nav>
                <i className="icon-menu" />
              </DropdownToggle>
              <DropdownMenu right>
                {this.props.loginStatus.status === 'loggedIn' &&
                  this.props.loginStatus.userLevel === 'admin' && (
                    <DropdownItem onClick={this.props.restart}>
                      {this.props.restarting ? (
                        <i className="fa fa-circle-o-notch text-danger fa-spin" />
                      ) : (
                        <i className="fa fa-circle-o-notch" />
                      )}{' '}
                      Restart
                    </DropdownItem>
                  )}
                {this.props.loginStatus.status === 'loggedIn' && (
                  <DropdownItem onClick={this.props.logout}>
                    <i className="fa fa-lock" /> Logout
                  </DropdownItem>
                )}
                {this.props.loginStatus.status !== 'loggedIn' &&
                  this.props.loginStatus.authenticationRequired && (
                    <DropdownItem href="#/login">
                      <i className="fa fa-lock" /> Login
                    </DropdownItem>
                  )}
              </DropdownMenu>
            </Dropdown>
          </div>
        </Nav>
      </header>
    )
  }
}

export default connect(
  ({ loginStatus, restarting, backpressureWarning }) => ({
    loginStatus,
    restarting,
    backpressureWarning
  }),
  { logout, restart, login }
)(Header)
