import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  MouseEvent,
  ReactNode
} from 'react'
import { NavLink, Location, useNavigate } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import Nav from 'react-bootstrap/Nav'
import {
  useAppStore,
  useAccessRequests,
  useDevices,
  useLoginStatus,
  usePlugins,
  type Plugin
} from '../../store'
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
  badges?: (BadgeData | null)[]
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

function pathMatchesChild(pathname: string, childUrl: string): boolean {
  return pathname === childUrl || pathname.startsWith(childUrl + '/')
}

interface SidebarProps {
  location: Location
}

export default function Sidebar({ location }: SidebarProps) {
  const navigate = useNavigate()
  const appStore = useAppStore()
  const accessRequests = useAccessRequests()
  const devices = useDevices()
  const loginStatus = useLoginStatus()
  const plugins = usePlugins()

  const nowMs = Date.now() // eslint-disable-line react-hooks/purity -- expired status is stable
  const expiredDeviceCount = devices.filter(
    (d) => d.tokenExpiry && d.tokenExpiry * 1000 < nowMs
  ).length

  const items = useMemo((): NavItemData[] => {
    const appUpdates = appStore.updates.length
    let updatesBadge: BadgeData | null = null
    let serverUpdateBadge: BadgeData | null = null
    let accessRequestsBadge: BadgeData | null = null
    let expiredDevicesBadge: BadgeData | null = null

    if (appUpdates > 0) {
      updatesBadge = {
        variant: 'success',
        text: `${appUpdates}`,
        color: 'success'
      }
    }

    if (accessRequests.length > 0) {
      accessRequestsBadge = {
        variant: 'success',
        text: `${accessRequests.length}`,
        color: 'success'
      }
    }

    if (expiredDeviceCount > 0) {
      expiredDevicesBadge = {
        variant: 'danger',
        text: `${expiredDeviceCount}`,
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

    const unconfiguredCount = plugins.filter((plugin: Plugin) => {
      const bundled = (plugin as Record<string, unknown>).bundled as
        | boolean
        | undefined
      const schema = (plugin as Record<string, unknown>).schema as
        | { properties?: Record<string, unknown> }
        | undefined
      const data = (plugin as Record<string, unknown>).data as
        | { configuration?: unknown }
        | undefined
      return (
        !bundled &&
        schema?.properties &&
        Object.keys(schema.properties).length > 0 &&
        (data?.configuration === null || data?.configuration === undefined)
      )
    }).length

    let unconfiguredBadge: BadgeData | null = null
    if (unconfiguredCount > 0) {
      unconfiguredBadge = {
        variant: 'warning',
        text: `${unconfiguredCount}`,
        color: 'warning'
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
          name: 'Apps & Plugins',
          url: '/plugins',
          icon: 'icon-puzzle',
          badges: [updatesBadge, unconfiguredBadge],
          children: [
            {
              name: 'Appstore',
              url: '/appstore',
              badge: updatesBadge
            },
            {
              name: 'Plugin Config',
              url: '/serverConfiguration/plugins/-',
              badge: unconfiguredBadge
            }
          ]
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
      const securityBadges: BadgeData[] = []
      if (accessRequestsBadge) securityBadges.push(accessRequestsBadge)
      if (expiredDevicesBadge) securityBadges.push(expiredDevicesBadge)

      const security: NavItemData = {
        name: 'Security',
        url: '/security',
        icon: 'icon-shield',
        badges: securityBadges,
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
          url: '/security/devices',
          badge: expiredDevicesBadge
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

    result.push({
      name: 'AsyncApi',
      url: '/asyncapi',
      icon: 'icon-feed'
    })

    return result
  }, [appStore, accessRequests, expiredDeviceCount, loginStatus, plugins])

  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(
    () => new Set<string>()
  )

  const lastPathnameRef = useRef<string | null>(null)

  // Auto-open dropdown matching the current path (only on pathname changes)
  useEffect(() => {
    if (lastPathnameRef.current === location.pathname) return

    const toOpen: string[] = []
    for (const item of items) {
      if (item.children?.length && item.url) {
        const hasActiveChild = item.children.some(
          (child) => child.url && pathMatchesChild(location.pathname, child.url)
        )
        if (hasActiveChild) {
          toOpen.push(item.url)
        }
      }
    }
    if (toOpen.length > 0) {
      setOpenDropdowns((prev) => {
        if (toOpen.every((url) => prev.has(url))) return prev
        const next = new Set(prev)
        for (const url of toOpen) {
          next.add(url)
        }
        return next
      })
    }
    lastPathnameRef.current = location.pathname
  }, [location.pathname, items])

  const handleClick = useCallback(
    (item: NavItemData) => (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      const itemUrl = item.url || ''
      const wasOpen = openDropdowns.has(itemUrl)
      setOpenDropdowns((prev) => {
        const next = new Set(prev)
        if (wasOpen) {
          next.delete(itemUrl)
        } else {
          next.add(itemUrl)
        }
        return next
      })
      if (!wasOpen && item.children?.length && item.url) {
        const storageKey = `admin.v1.sidebar.lastPage.${item.url}`
        let lastPage: string | null = null
        try {
          lastPage = localStorage.getItem(storageKey)
        } catch (e) {
          console.warn('localStorage.getItem failed:', e)
        }
        const target =
          lastPage && item.children.some((c) => c.url === lastPage)
            ? lastPage
            : item.children[0].url
        if (target) {
          navigate(target)
        }
      }
    },
    [navigate, openDropdowns]
  )

  useEffect(() => {
    for (const item of items) {
      if (item.children?.length && item.url) {
        const matchedChild = item.children.find(
          (child) => child.url && pathMatchesChild(location.pathname, child.url)
        )
        if (matchedChild?.url) {
          try {
            localStorage.setItem(
              `admin.v1.sidebar.lastPage.${item.url}`,
              matchedChild.url
            )
          } catch (e) {
            console.warn('localStorage.setItem failed:', e)
          }
        }
      }
    }
  }, [location.pathname, items])

  const activeRoute = useCallback(
    (routeName: string) => {
      const isOpen = openDropdowns.has(routeName)
      return isOpen ? 'nav-item nav-dropdown open' : 'nav-item nav-dropdown'
    },
    [openDropdowns]
  )

  const renderBadge = (badgeData?: BadgeData | null): ReactNode => {
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

  const renderBadges = (item: NavItemData): ReactNode => {
    if (item.badges) {
      return (
        <>
          {item.badges.map(
            (b, index) =>
              b && (
                <React.Fragment key={`badge-${index}`}>
                  {renderBadge(b)}
                </React.Fragment>
              )
          )}
        </>
      )
    }
    return renderBadge(item.badge)
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
            {renderBadges(item)}
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
            {renderBadges(item)}
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
          onClick={handleClick(item)}
        >
          {renderIcon(item.icon)}
          {item.name}
          {renderBadges(item)}
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
