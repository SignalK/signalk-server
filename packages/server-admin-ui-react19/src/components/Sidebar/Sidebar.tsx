import React, { useMemo, useCallback, MouseEvent, ReactNode } from 'react'
import { NavLink, Location } from 'react-router-dom'
import Badge from 'react-bootstrap/Badge'
import Nav from 'react-bootstrap/Nav'
import {
  useAppStore,
  useAccessRequests,
  useLoginStatus,
  useSourcesData,
  useMultiSourcePaths,
  useSourcePriorities,
  useSourceRanking
} from '../../store'
import {
  extractN2kDevices,
  detectInstanceConflicts
} from '../../utils/sourceLabels'
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
  const sourcesData = useSourcesData()

  const conflictCount = useMemo(() => {
    if (!sourcesData) return 0
    const devices = extractN2kDevices(sourcesData)
    return detectInstanceConflicts(devices).length
  }, [sourcesData])

  const multiSourcePaths = useMultiSourcePaths()
  const sourcePrioritiesData = useSourcePriorities()
  const sourceRankingData = useSourceRanking()

  const unconfiguredPriorityCount = useMemo(() => {
    const configuredSourcesByPath = new Map<string, Set<string>>()
    for (const pp of sourcePrioritiesData.sourcePriorities) {
      if (pp.path) {
        configuredSourcesByPath.set(
          pp.path,
          new Set(pp.priorities.map((p) => p.sourceRef))
        )
      }
    }
    const rankedRefs = new Set(
      sourceRankingData.ranking.map((r) => r.sourceRef)
    )

    let count = 0
    for (const [path, sources] of Object.entries(multiSourcePaths)) {
      const configuredRefs = configuredSourcesByPath.get(path)
      const hasUncoveredSource = sources.some((ref) => {
        if (configuredRefs?.has(ref)) return false
        if (rankedRefs.has(ref)) return false
        return true
      })
      if (hasUncoveredSource) count++
    }
    return count
  }, [multiSourcePaths, sourcePrioritiesData, sourceRankingData])

  const items = useMemo((): NavItemData[] => {
    const appUpdates = appStore.updates.length
    let updatesBadge: BadgeData | null = null
    let serverUpdateBadge: BadgeData | null = null
    let accessRequestsBadge: BadgeData | null = null

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

    const isAdmin =
      !loginStatus.authenticationRequired || loginStatus.userLevel === 'admin'

    const dataChildren: NavItemData[] = [
      { name: 'Data Browser', url: '/data/browser' },
      { name: 'Meta Data', url: '/data/meta' },
      {
        name: 'Source Discovery',
        url: '/data/sources',
        badge:
          conflictCount > 0
            ? { variant: 'warning', text: `${conflictCount}` }
            : null
      }
    ]
    if (isAdmin) {
      dataChildren.push(
        {
          name: 'Source Priority',
          url: '/data/priorities',
          badge:
            unconfiguredPriorityCount > 0
              ? {
                  variant: 'warning',
                  text: `${unconfiguredPriorityCount}`
                }
              : null
        },
        { name: 'Unit Preferences', url: '/data/units' },
        { name: 'Data Fiddler', url: '/data/fiddler' },
        { name: 'Data Connections', url: '/data/connections/-' }
      )
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
        name: 'Data',
        url: '/data',
        icon: 'icon-folder',
        badge:
          unconfiguredPriorityCount + conflictCount > 0
            ? {
                variant: 'warning',
                text: `${unconfiguredPriorityCount + conflictCount}`
              }
            : null,
        children: dataChildren
      }
    ]

    if (isAdmin) {
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
  }, [
    appStore,
    accessRequests,
    loginStatus,
    conflictCount,
    unconfiguredPriorityCount
  ])

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
      <style>{`.nav-dropdown.open > .nav-dropdown-toggle > .badge { display: none; }`}</style>
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
