import { useState, useEffect, useCallback, MouseEvent } from 'react'
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faBars } from '@fortawesome/free-solid-svg-icons/faBars'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import {
  useLoginStatus,
  useRestarting,
  useBackpressureWarning
} from '../../store'
import { logoutAction, restartAction } from '../../actions'

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const loginStatus = useLoginStatus()
  const restarting = useRestarting()
  const backpressureWarning = useBackpressureWarning()

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

  const sidebarToggle = (e: MouseEvent) => {
    e.preventDefault()
    document.body.classList.toggle('sidebar-hidden')
  }

  const handleLogout = () => {
    logoutAction()
  }

  const handleRestart = () => {
    restartAction()
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
          <FontAwesomeIcon icon={faTriangleExclamation} /> Network congestion
          detected – some updates were skipped. Check your connection.
        </Alert>
      )}
      <NavbarBrand href="#" />
      <NavbarToggler className="me-auto" onClick={sidebarToggle}>
        <span className="navbar-toggler-icon" />
      </NavbarToggler>
      <Nav className="ms-auto" navbar>
        {/* Desktop: show items directly */}
        {loginStatus.status === 'loggedIn' &&
          loginStatus.userLevel === 'admin' && (
            <NavItem className="d-none d-sm-block px-3">
              <NavLink href="#/" onClick={handleRestart}>
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  spin={restarting}
                  className={restarting ? 'text-danger' : ''}
                />{' '}
                Restart
              </NavLink>
            </NavItem>
          )}
        {loginStatus.status === 'loggedIn' && (
          <NavItem className="d-none d-sm-block px-3">
            <NavLink href="#/" onClick={handleLogout}>
              <FontAwesomeIcon icon={faLock} /> Logout
            </NavLink>
          </NavItem>
        )}
        {loginStatus.status !== 'loggedIn' &&
          loginStatus.authenticationRequired && (
            <NavItem className="d-none d-sm-block px-3">
              <NavLink href="#/login">
                <FontAwesomeIcon icon={faLock} /> Login
              </NavLink>
            </NavItem>
          )}
        {/* Mobile: show dropdown menu */}
        <div className="d-sm-none">
          <Dropdown nav isOpen={dropdownOpen} toggle={toggleDropdown}>
            <DropdownToggle nav>
              <FontAwesomeIcon icon={faBars} />
            </DropdownToggle>
            <DropdownMenu end>
              {loginStatus.status === 'loggedIn' &&
                loginStatus.userLevel === 'admin' && (
                  <DropdownItem onClick={handleRestart}>
                    <FontAwesomeIcon
                      icon={faCircleNotch}
                      spin={restarting}
                      className={restarting ? 'text-danger' : ''}
                    />{' '}
                    Restart
                  </DropdownItem>
                )}
              {loginStatus.status === 'loggedIn' && (
                <DropdownItem onClick={handleLogout}>
                  <FontAwesomeIcon icon={faLock} /> Logout
                </DropdownItem>
              )}
              {loginStatus.status !== 'loggedIn' &&
                loginStatus.authenticationRequired && (
                  <DropdownItem href="#/login">
                    <FontAwesomeIcon icon={faLock} /> Login
                  </DropdownItem>
                )}
            </DropdownMenu>
          </Dropdown>
        </div>
      </Nav>
    </header>
  )
}
