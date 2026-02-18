import React, { useMemo, useCallback, MouseEvent, ReactNode } from 'react'
import { NavLink, Location } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import Nav from 'react-bootstrap/Nav'
import { useAppStore, useAccessRequests, useLoginStatus } from '../../store'
import classNames from 'classnames'
import SidebarFooter from './../SidebarFooter/SidebarFooter'
import SidebarForm from './../SidebarForm/SidebarForm'
import SidebarHeader from './../SidebarHeader/SidebarHeader'
import SidebarMinimizer from './../SidebarMinimizer/SidebarMinimizer'

interface BadgeData {
  variant?: string
  text?: string
  color?: string
  class?: string
}

interface NavItemData {
  name: string
  url?: string
  icon?: string
  badge?: BadgeData | null
  class?: string
  variant?: string
  title?: boolean
  divider?: boolean
  children?: NavItemData[]
  wrapper?: {
    element: string
    attributes?: Record<string, unknown>
  }
  props?: Record<string, unknown>
}

interface SidebarProps {
  location: Location
}

export default function Sidebar({ location }: SidebarProps) {
  const appStore = useAppStore()
  const accessRequests = useAccessRequests()
  const loginStatus = useLoginStatus()

  const items = useMemo((): NavItemData[] => {
    const appUpdates = appStore.updates.length
    const appDeprecated = appStore.deprecated?.length || 0
    let appstoreBadge: BadgeData | null = null
    let serverUpdateBadge: BadgeData | null = null
    let accessRequestsBadge: BadgeData | null = null

    if (appStore.storeAvailable === false) {
      appstoreBadge = {
        variant: 'danger',
        text: 'OFFLINE'
      }
    } else if (appUpdates > 0 && appDeprecated > 0) {
      appstoreBadge = {
        variant: 'warning',
        text: `${appUpdates}\u2191 ${appDeprecated}\u2717`,
        color: 'warning'
      }
    } else if (appDeprecated > 0) {
      appstoreBadge = {
        variant: 'danger',
        text: `${appDeprecated}`,
        color: 'danger'
      }
    } else if (appUpdates > 0) {
      appstoreBadge = {
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

    if (appStore.serverUpdate) {
      serverUpdateBadge = {
        variant: 'danger',
        text: appStore.serverUpdate,
        color: 'danger'
      }
    }

    const result: NavItemData[] = [
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
          badge: appstoreBadge
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
      const security: NavItemData = {
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
        security.children!.push({
          name: 'Devices',
          url: '/security/devices'
        })
      }
      if (
        loginStatus.allowNewUserRegistration ||
        loginStatus.allowDeviceAccessRequests
      ) {
        security.children!.push({
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

  const handleClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    ;(e.target as HTMLElement).parentElement?.classList.toggle('open')
  }, [])

  const activeRoute = useCallback(
    (routeName: string) => {
      return location.pathname.indexOf(routeName) > -1
        ? 'nav-item nav-dropdown open'
        : 'nav-item nav-dropdown'
    },
    [location.pathname]
  )

  const badge = (badgeData?: BadgeData | null): ReactNode => {
    if (badgeData) {
      const classes = classNames(badgeData.class)
      return (
        <Badge className={classes} bg={badgeData.variant}>
          {badgeData.text}
        </Badge>
      )
    }
    return null
  }

  const wrapper = (item: NavItemData): ReactNode => {
    return item.wrapper && item.wrapper.element
      ? React.createElement(
          item.wrapper.element,
          item.wrapper.attributes,
          item.name
        )
      : item.name
  }

  const title = (titleItem: NavItemData, key: number): ReactNode => {
    const classes = classNames('nav-title', titleItem.class)
    return (
      <li key={key} className={classes}>
        {wrapper(titleItem)}{' '}
      </li>
    )
  }

  const divider = (dividerItem: NavItemData, key: number): ReactNode => {
    const classes = classNames('divider', dividerItem.class)
    return <li key={key} className={classes} />
  }

  const renderIcon = (iconClass?: string): ReactNode => {
    if (!iconClass) return null
    return <i className={classNames(iconClass, 'nav-icon')} />
  }

  const navLink = (
    item: NavItemData,
    key: number,
    classes: { item: string; link: string; icon: string }
  ): ReactNode => {
    const url = item.url ? item.url : ''
    const isExternal = (url: string) => {
      const link = url ? url.substring(0, 4) : ''
      return link === 'http'
    }
    return (
      <Nav.Item as="li" key={key} className={classes.item}>
        {isExternal(url) ? (
          <Nav.Link href={url} className={classes.link} {...(item.props || {})}>
            {renderIcon(item.icon)}
            {item.name}
            {badge(item.badge)}
          </Nav.Link>
        ) : (
          <NavLink
            to={url}
            className={({ isActive }) =>
              isActive ? `${classes.link} active` : classes.link
            }
            {...(item.props || {})}
          >
            {renderIcon(item.icon)}
            {item.name}
            {badge(item.badge)}
          </NavLink>
        )}
      </Nav.Item>
    )
  }

  const navItem = (item: NavItemData, key: number): ReactNode => {
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

  const navDropdown = (item: NavItemData, key: number): ReactNode => {
    return (
      <li key={key} className={activeRoute(item.url || '')}>
        <a
          className="nav-link nav-dropdown-toggle"
          href="#"
          onClick={handleClick}
        >
          {renderIcon(item.icon)}
          {item.name}
          {badge(item.badge)}
        </a>
        <ul className="nav-dropdown-items">{navList(item.children || [])}</ul>
      </li>
    )
  }

  const navType = (item: NavItemData, idx: number): ReactNode =>
    item.title
      ? title(item, idx)
      : item.divider
        ? divider(item, idx)
        : item.children
          ? navDropdown(item, idx)
          : navItem(item, idx)

  const navList = (navItems: NavItemData[]): ReactNode[] => {
    return navItems.map((item, index) => navType(item, index))
  }

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
