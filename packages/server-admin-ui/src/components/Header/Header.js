import React, { useState, useEffect, useCallback } from 'react'
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
import { useSelector, useDispatch } from 'react-redux'
import { logout, restart } from '../../actions'

const Header = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dispatch = useDispatch()

  const loginStatus = useSelector((state) => state.loginStatus)
  const restarting = useSelector((state) => state.restarting)
  const backpressureWarning = useSelector((state) => state.backpressureWarning)

  const handleSidebarHide = useCallback(() => {
    document.body.classList.toggle('sidebar-hidden', true)
    document.body.classList.toggle('sidebar-mobile-show', false)
  }, [])

  const handlePopstate = useCallback(() => {
    document.body.classList.toggle('sidebar-mobile-show', false)
  }, [])

  useEffect(() => {
    window.addEventListener('sidebar:hide', handleSidebarHide)
    window.addEventListener('popstate', handlePopstate)
    return () => {
      window.removeEventListener('sidebar:hide', handleSidebarHide)
      window.removeEventListener('popstate', handlePopstate)
    }
  }, [handleSidebarHide, handlePopstate])

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen)
  }

  const sidebarToggle = (e) => {
    e.preventDefault()
    document.body.classList.toggle('sidebar-hidden')
  }

  const mobileSidebarToggle = (e) => {
    e.preventDefault()
    document.body.classList.toggle('sidebar-mobile-show')
  }

  const handleLogout = () => {
    dispatch(logout())
  }

  const handleRestart = () => {
    dispatch(restart())
  }

  return (
    <header className="app-header navbar">
      {backpressureWarning && (
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
      <NavbarToggler className="d-lg-none" onClick={mobileSidebarToggle}>
        <span className="navbar-toggler-icon" />
      </NavbarToggler>
      <NavbarBrand href="#" />
      <NavbarToggler className="d-md-down-none me-auto" onClick={sidebarToggle}>
        <span className="navbar-toggler-icon" />
      </NavbarToggler>
      <Nav className="ms-auto" navbar>
        <NavItem className="d-md-down-none px-3">
          {loginStatus.status === 'loggedIn' &&
            loginStatus.userLevel === 'admin' && (
              <NavLink href="#/" onClick={handleRestart}>
                {restarting ? (
                  <i className="fa fa-circle-o-notch text-danger fa-spin" />
                ) : (
                  <i className="fa fa-circle-o-notch" />
                )}{' '}
                Restart
              </NavLink>
            )}
        </NavItem>
        {loginStatus.status === 'loggedIn' && (
          <NavItem className="d-md-down-none px-3">
            <NavLink href="#/" onClick={handleLogout}>
              <i className="fa fa-lock" /> Logout
            </NavLink>
          </NavItem>
        )}
        {loginStatus.status !== 'loggedIn' &&
          loginStatus.authenticationRequired && (
            <NavItem className="d-md-down-none px-3">
              <NavLink href="#/login">
                <i className="fa fa-lock" /> Login
              </NavLink>
            </NavItem>
          )}
        <div className="d-lg-none">
          <Dropdown nav isOpen={dropdownOpen} toggle={toggleDropdown}>
            <DropdownToggle nav>
              <i className="icon-menu" />
            </DropdownToggle>
            <DropdownMenu end>
              {loginStatus.status === 'loggedIn' &&
                loginStatus.userLevel === 'admin' && (
                  <DropdownItem onClick={handleRestart}>
                    {restarting ? (
                      <i className="fa fa-circle-o-notch text-danger fa-spin" />
                    ) : (
                      <i className="fa fa-circle-o-notch" />
                    )}{' '}
                    Restart
                  </DropdownItem>
                )}
              {loginStatus.status === 'loggedIn' && (
                <DropdownItem onClick={handleLogout}>
                  <i className="fa fa-lock" /> Logout
                </DropdownItem>
              )}
              {loginStatus.status !== 'loggedIn' &&
                loginStatus.authenticationRequired && (
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

export default Header
