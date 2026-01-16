import React, { useMemo, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { Badge, Nav, NavItem, NavLink as RsNavLink } from 'reactstrap'
import { useSelector } from 'react-redux'
import classNames from 'classnames'
import SidebarFooter from './../SidebarFooter/SidebarFooter'
import SidebarForm from './../SidebarForm/SidebarForm'
import SidebarHeader from './../SidebarHeader/SidebarHeader'
import SidebarMinimizer from './../SidebarMinimizer/SidebarMinimizer'

const Sidebar = ({ location }) => {
  const appStore = useSelector((state) => state.appStore)
  const accessRequests = useSelector((state) => state.accessRequests)
  const loginStatus = useSelector((state) => state.loginStatus)

  const items = useMemo(() => {
    const appUpdates = appStore.updates.length
    let updatesBadge = null
    let serverUpdateBadge = null
    let accessRequestsBadge = null

    if (appUpdates > 0) {
      updatesBadge = {
        variant: 'success',
        text: `${appUpdates}`,
        color: 'success'
      }
    }

    if (accessRequests.length > 0) {
      accessRequestsBadge = {
        variant: 'danger',
        text: `${accessRequests.length}`,
        color: 'danger'
      }
    }

    if (appStore.storeAvailable === false) {
      updatesBadge = {
        variant: 'danger',
        text: 'OFFLINE'
      }
    }

    if (appStore.serverUpdate) {
      serverUpdateBadge = {
        variant: 'danger',
        text: appStore.serverUpdate,
        color: 'danger'
      }
    }

    const result = [
      {
        name: 'Dashboard',
        url: '/dashboard',
        icon: 'icon-speedometer'
      },
      {
        name: 'Webapps',
        url: '/webapps',
        icon: 'icon-grid'
      },
      {
        name: 'Data Browser',
        url: '/databrowser',
        icon: 'icon-folder'
      }
    ]

    if (
      !loginStatus.authenticationRequired ||
      loginStatus.userLevel === 'admin'
    ) {
      result.push(
        {
          name: 'Appstore',
          url: '/appstore',
          icon: 'icon-basket',
          badge: updatesBadge
        },
        {
          name: 'Server',
          url: '/serverConfiguration',
          icon: 'icon-settings',
          children: [
            {
              name: 'Settings',
              url: '/serverConfiguration/settings'
            },
            {
              name: 'Data Connections',
              url: '/serverConfiguration/connections/-'
            },
            {
              name: 'Plugin Config',
              url: '/serverConfiguration/plugins/-'
            },
            {
              name: 'Server Logs',
              url: '/serverConfiguration/log'
            },
            {
              name: 'Update',
              url: '/serverConfiguration/update',
              badge: serverUpdateBadge
            },
            {
              name: 'Data Fiddler',
              url: '/serverConfiguration/datafiddler'
            },
            {
              name: 'Backup/Restore',
              url: '/serverConfiguration/backuprestore'
            }
          ]
        }
      )
    }

    if (
      loginStatus.authenticationRequired === false ||
      loginStatus.userLevel === 'admin'
    ) {
      const security = {
        name: 'Security',
        url: '/security',
        icon: 'icon-shield',
        badge: accessRequestsBadge,
        children: [
          {
            name: 'Settings',
            url: '/security/settings'
          },
          {
            name: 'Users',
            url: '/security/users'
          }
        ]
      }
      if (loginStatus.allowDeviceAccessRequests) {
        security.children.push({
          name: 'Devices',
          url: '/security/devices'
        })
      }
      if (
        loginStatus.allowNewUserRegistration ||
        loginStatus.allowDeviceAccessRequests
      ) {
        security.children.push({
          name: 'Access Requests',
          url: '/security/access/requests',
          badge: accessRequestsBadge
        })
      }
      result.push(security)
    }

    result.push({
      name: 'Documentation',
      url: '/documentation',
      icon: 'icon-book-open'
    })

    result.push({
      name: 'OpenApi',
      url: `${window.location.protocol}//${window.location.host}/doc/openapi`,
      icon: 'icon-energy',
      props: {
        target: '_blank',
        rel: 'noopener noreferrer'
      }
    })

    return result
  }, [appStore, accessRequests, loginStatus])

  const handleClick = useCallback((e) => {
    e.preventDefault()
    e.target.parentElement.classList.toggle('open')
  }, [])

  const activeRoute = useCallback(
    (routeName) => {
      return location.pathname.indexOf(routeName) > -1
        ? 'nav-item nav-dropdown open'
        : 'nav-item nav-dropdown'
    },
    [location.pathname]
  )

  // badge addon to NavItem
  const badge = (badgeData) => {
    if (badgeData) {
      const classes = classNames(badgeData.class)
      return (
        <Badge className={classes} color={badgeData.variant}>
          {badgeData.text}
        </Badge>
      )
    }
  }

  // simple wrapper for nav-title item
  const wrapper = (item) => {
    return item.wrapper && item.wrapper.element
      ? React.createElement(
          item.wrapper.element,
          item.wrapper.attributes,
          item.name
        )
      : item.name
  }

  // nav list section title
  const title = (titleItem, key) => {
    const classes = classNames('nav-title', titleItem.class)
    return (
      <li key={key} className={classes}>
        {wrapper(titleItem)}{' '}
      </li>
    )
  }

  // nav list divider
  const divider = (dividerItem, key) => {
    const classes = classNames('divider', dividerItem.class)
    return <li key={key} className={classes} />
  }

  // nav link
  const navLink = (item, key, classes) => {
    const url = item.url ? item.url : ''
    const isExternal = (url) => {
      const link = url ? url.substring(0, 4) : ''
      return link === 'http'
    }
    return (
      <NavItem key={key} className={classes.item}>
        {isExternal(url) ? (
          <RsNavLink
            href={url}
            className={classes.link}
            {...(item.props || {})}
          >
            <i className={classes.icon} />
            {item.name}
            {badge(item.badge)}
          </RsNavLink>
        ) : (
          <NavLink
            to={url}
            className={({ isActive }) =>
              isActive ? `${classes.link} active` : classes.link
            }
            {...(item.props || {})}
          >
            <i className={classes.icon} />
            {item.name}
            {badge(item.badge)}
          </NavLink>
        )}
      </NavItem>
    )
  }

  // nav item with nav link
  const navItem = (item, key) => {
    const classes = {
      item: classNames(item.class),
      link: classNames(
        'nav-link',
        item.variant ? `nav-link-${item.variant}` : ''
      ),
      icon: classNames(item.icon)
    }
    return navLink(item, key, classes)
  }

  // nav dropdown
  const navDropdown = (item, key) => {
    return (
      <li key={key} className={activeRoute(item.url)}>
        <a
          className="nav-link nav-dropdown-toggle"
          href="#"
          onClick={handleClick}
        >
          <i className={item.icon} />
          {item.name}
          {badge(item.badge)}
        </a>
        <ul className="nav-dropdown-items">{navList(item.children)}</ul>
      </li>
    )
  }

  // nav type
  const navType = (item, idx) =>
    item.title
      ? title(item, idx)
      : item.divider
        ? divider(item, idx)
        : item.children
          ? navDropdown(item, idx)
          : navItem(item, idx)

  // nav list
  const navList = (navItems) => {
    return navItems.map((item, index) => navType(item, index))
  }

  // sidebar-nav root
  return (
    <div className="sidebar">
      <SidebarHeader />
      <SidebarForm />
      <nav className="sidebar-nav">
        <Nav>{navList(items)}</Nav>
      </nav>
      <SidebarFooter />
      <SidebarMinimizer />
    </div>
  )
}

export default Sidebar
