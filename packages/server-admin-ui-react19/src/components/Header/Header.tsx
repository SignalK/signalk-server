import { useState, useEffect, useCallback, type MouseEvent } from 'react'
import Alert from 'react-bootstrap/Alert'
import Dropdown from 'react-bootstrap/Dropdown'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
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

  const mobileSidebarToggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    document.body.classList.toggle('sidebar-mobile-show')
  }

  const sidebarToggle = (e: MouseEvent<HTMLButtonElement>) => {
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
          variant="warning"
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
      <button
        type="button"
        className="navbar-toggler d-lg-none"
        onClick={mobileSidebarToggle}
        aria-label="Toggle sidebar"
      >
        <span className="navbar-toggler-icon" />
      </button>
      <Navbar.Brand href="#" />
      <button
        type="button"
        className="navbar-toggler d-none d-lg-block me-auto"
        onClick={sidebarToggle}
        aria-label="Toggle sidebar"
      >
        <span className="navbar-toggler-icon" />
      </button>
      <span className="text-warning flex-grow-1 text-center fw-semibold">
        Admin UI React 19 version for testing
      </span>
      <Nav className="ms-auto">
        {/* Desktop: show items directly */}
        {loginStatus.status === 'loggedIn' &&
          loginStatus.userLevel === 'admin' && (
            <Nav.Item className="d-none d-sm-block px-3">
              <Nav.Link href="#/" onClick={handleRestart}>
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  spin={restarting}
                  className={restarting ? 'text-danger' : ''}
                />{' '}
                Restart
              </Nav.Link>
            </Nav.Item>
          )}
        {loginStatus.status === 'loggedIn' && (
          <Nav.Item className="d-none d-sm-block px-3">
            <Nav.Link href="#/" onClick={handleLogout}>
              <FontAwesomeIcon icon={faLock} /> Logout
            </Nav.Link>
          </Nav.Item>
        )}
        {loginStatus.status !== 'loggedIn' &&
          loginStatus.authenticationRequired && (
            <Nav.Item className="d-none d-sm-block px-3">
              <Nav.Link href="#/login">
                <FontAwesomeIcon icon={faLock} /> Login
              </Nav.Link>
            </Nav.Item>
          )}
        {/* Mobile: show dropdown menu */}
        <div className="d-sm-none">
          <Dropdown as={Nav.Item} show={dropdownOpen} onToggle={toggleDropdown}>
            <Dropdown.Toggle as={Nav.Link}>
              <FontAwesomeIcon icon={faBars} />
            </Dropdown.Toggle>
            <Dropdown.Menu align="end">
              {loginStatus.status === 'loggedIn' &&
                loginStatus.userLevel === 'admin' && (
                  <Dropdown.Item onClick={handleRestart}>
                    <FontAwesomeIcon
                      icon={faCircleNotch}
                      spin={restarting}
                      className={restarting ? 'text-danger' : ''}
                    />{' '}
                    Restart
                  </Dropdown.Item>
                )}
              {loginStatus.status === 'loggedIn' && (
                <Dropdown.Item onClick={handleLogout}>
                  <FontAwesomeIcon icon={faLock} /> Logout
                </Dropdown.Item>
              )}
              {loginStatus.status !== 'loggedIn' &&
                loginStatus.authenticationRequired && (
                  <Dropdown.Item href="#/login">
                    <FontAwesomeIcon icon={faLock} /> Login
                  </Dropdown.Item>
                )}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </Nav>
    </header>
  )
}
