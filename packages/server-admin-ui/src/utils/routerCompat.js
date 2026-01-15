import React from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

/**
 * HOC to provide router hooks to class components
 * Replaces the deprecated withRouter HOC from react-router v4/v5
 */
export const withRouter = (Component) => {
  const ComponentWithRouter = (props) => {
    const location = useLocation()
    const navigate = useNavigate()
    const params = useParams()

    return (
      <Component
        {...props}
        location={location}
        navigate={navigate}
        params={params}
        match={{ params }}
        history={{
          push: navigate,
          replace: (path) => navigate(path, { replace: true })
        }}
      />
    )
  }

  ComponentWithRouter.displayName = `withRouter(${Component.displayName || Component.name || 'Component'})`
  return ComponentWithRouter
}
