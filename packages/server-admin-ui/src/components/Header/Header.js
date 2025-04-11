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
  Dropdown
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
  }

  componentDidMount() {
    window.addEventListener('sidebar:hide', () => {
      document.body.classList.toggle('sidebar-hidden', true)
      document.body.classList.toggle('sidebar-mobile-show', false)
    })

    window.addEventListener('popstate', () => {
      document.body.classList.toggle('sidebar-mobile-show', false)
    })
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
              this.props.loginStatus.userLevel == 'admin' && (
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
                  this.props.loginStatus.userLevel == 'admin' && (
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
  ({ loginStatus, restarting }) => ({ loginStatus, restarting }),
  { logout, restart, login }
)(Header)
