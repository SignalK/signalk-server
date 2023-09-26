import React, { Component } from 'react'
import { NavLink } from 'react-router-dom'
import { Badge, Nav, NavItem, NavLink as RsNavLink } from 'reactstrap'
import { connect } from 'react-redux'
import classNames from 'classnames'
import SidebarFooter from './../SidebarFooter/SidebarFooter'
import SidebarForm from './../SidebarForm/SidebarForm'
import SidebarHeader from './../SidebarHeader/SidebarHeader'
import SidebarMinimizer from './../SidebarMinimizer/SidebarMinimizer'

class Sidebar extends Component {
  handleClick(e) {
    e.preventDefault()
    e.target.parentElement.classList.toggle('open')
  }

  activeRoute(routeName, props) {
    // return this.props.location.pathname.indexOf(routeName) > -1 ? 'nav-item nav-dropdown open' : 'nav-item nav-dropdown';
    return props.location.pathname.indexOf(routeName) > -1
      ? 'nav-item nav-dropdown open'
      : 'nav-item nav-dropdown'
  }

  render() {
    const props = this.props
    const activeRoute = this.activeRoute
    const handleClick = this.handleClick

    // badge addon to NavItem
    const badge = (badge) => {
      if (badge) {
        const classes = classNames(badge.class)
        return (
          <Badge className={classes} color={badge.variant}>
            {badge.text}
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
    const title = (title, key) => {
      const classes = classNames('nav-title', title.class)
      return (
        <li key={key} className={classes}>
          {wrapper(title)}{' '}
        </li>
      )
    }

    // nav list divider
    const divider = (divider, key) => {
      const classes = classNames('divider', divider.class)
      return <li key={key} className={classes} />
    }

    // nav item with nav link
    const navItem = (item, key) => {
      const classes = {
        item: classNames(item.class),
        link: classNames(
          'nav-link',
          item.variant ? `nav-link-${item.variant}` : ''
        ),
        icon: classNames(item.icon),
      }
      return navLink(item, key, classes)
    }

    // nav link
    const navLink = (item, key, classes) => {
      const url = item.url ? item.url : ''
      return (
        <NavItem key={key} className={classes.item}>
          {isExternal(url) ? (
            <RsNavLink href={url} className={classes.link}>
              <i className={classes.icon} />
              {item.name}
              {badge(item.badge)}
            </RsNavLink>
          ) : (
            <NavLink to={url} className={classes.link} activeClassName="active">
              <i className={classes.icon} />
              {item.name}
              {badge(item.badge)}
            </NavLink>
          )}
        </NavItem>
      )
    }

    // nav dropdown
    const navDropdown = (item, key) => {
      console.log('****', item)
      return (
        <li key={key} className={activeRoute(item.url, props)}>
          <a
            className="nav-link nav-dropdown-toggle"
            href="#"
            onClick={handleClick.bind(this)}
          >
            <i className={item.icon} />
            {item.name}
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
    const navList = (items) => {
      return items.map((item, index) => navType(item, index))
    }

    const isExternal = (url) => {
      const link = url ? url.substring(0, 4) : ''
      return link === 'http'
    }

    // sidebar-nav root
    return (
      <div className="sidebar">
        <SidebarHeader />
        <SidebarForm />
        <nav className="sidebar-nav">
          <Nav>{navList(props.items)}</Nav>
        </nav>
        <SidebarFooter />
        <SidebarMinimizer />
      </div>
    )
  }
}

const mapStateToProps = (state) => {
  var appUpdates = state.appStore.updates.length
  var updatesBadge = null
  var availableBadge = null
  var serverUpdateBadge = null
  var accessRequestsBadge = null

  if (appUpdates > 0) {
    updatesBadge = {
      variant: 'danger',
      text: `${appUpdates}`,
      color: 'danger',
    }
  }

  if (state.accessRequests.length > 0) {
    accessRequestsBadge = {
      variant: 'danger',
      text: `${state.accessRequests.length}`,
      color: 'danger',
    }
  }

  if (!state.appStore.storeAvailable) {
    updatesBadge = availableBadge = {
      variant: 'danger',
      text: 'OFFLINE',
    }
  }

  if (state.appStore.serverUpdate) {
    serverUpdateBadge = {
      variant: 'danger',
      text: state.appStore.serverUpdate,
      color: 'danger',
    }
  }

  var result = {
    items: [
      {
        name: 'Dashboard',
        url: '/dashboard',
        icon: 'icon-speedometer',
      },
      {
        name: 'Webapps',
        url: '/webapps',
        icon: 'icon-grid',
      },
      {
        name: 'Data Browser',
        url: '/databrowser',
        icon: 'icon-folder',
      },
    ],
  }

  if (
    !state.loginStatus.authenticationRequired ||
    state.loginStatus.userLevel == 'admin'
  ) {
    const openPlugin = localStorage.getItem('admin.v1.plugins.openPlugin')
    result.items.push.apply(result.items, [
      {
        name: 'Appstore',
        url: '/appstore',
        icon: 'icon-basket',
        children: [
          {
            name: 'Available',
            url: '/appstore/apps',
            badge: availableBadge,
          },
          {
            name: 'Installed',
            url: '/appstore/installed',
          },
          {
            name: 'Updates',
            url: '/appstore/updates',
            badge: updatesBadge,
          },
        ],
      },
      {
        name: 'Server',
        url: '/serverConfiguration',
        icon: 'icon-settings',
        children: [
          {
            name: 'Settings',
            url: '/serverConfiguration/settings',
          },
          {
            name: 'Data Connections',
            url: '/serverConfiguration/connections/-',
          },
          {
            name: 'Plugin Config',
            url: '/serverConfiguration/plugins/' + (openPlugin || '-'),
          },
          {
            name: 'Server Log',
            url: '/serverConfiguration/log',
          },
          {
            name: 'Update',
            url: '/serverConfiguration/update',
            badge: serverUpdateBadge,
          },
          {
            name: 'Data Fiddler',
            url: '/serverConfiguration/datafiddler',
          },
          {
            name: 'Backup/Restore',
            url: '/serverConfiguration/backuprestore',
          },
        ],
      },
    ])
  }

  if (
    state.loginStatus.authenticationRequired === false ||
    state.loginStatus.userLevel == 'admin'
  ) {
    var security = {
      name: 'Security',
      url: '/security',
      icon: 'icon-shield',
      badge: accessRequestsBadge,
      children: [
        {
          name: 'Settings',
          url: '/security/settings',
        },
        {
          name: 'Users',
          url: '/security/users',
        },
      ],
    }
    if (state.loginStatus.allowDeviceAccessRequests) {
      security.children.push({
        name: 'Devices',
        url: '/security/devices',
      })
    }
    if (
      state.loginStatus.allowNewUserRegistration ||
      state.loginStatus.allowDeviceAccessRequests
    ) {
      security.children.push({
        name: 'Access Requests',
        url: '/security/access/requests',
        badge: accessRequestsBadge,
      })
    }
    result.items.push(security)
  }

  result.items.push({
    name: 'Documentation',
    url: `${window.location.protocol}//${window.location.host}/documentation`,
    icon: 'icon-book-open',
  })

  result.items.push({
    name: 'OpenApi',
    url: `${window.location.protocol}//${window.location.host}/doc/openapi`,
    icon: 'icon-energy',
  })

  return result
}

const pluginMenuItems = (plugins) => {
  return plugins
    ? plugins.map((pluginData) => {
        return {
          name: pluginData.name,
          url: `/plugins/${pluginData.id}`,
        }
      })
    : []
}

export default connect(mapStateToProps)(Sidebar)
