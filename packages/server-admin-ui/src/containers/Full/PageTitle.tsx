import { useEffect } from 'react'
import { useMatch } from 'react-router-dom'
import { useVesselInfo, useWebapps } from '../../store'
import { toSafeModuleId } from '../../views/Webapps/dynamicutilities'

export default function PageTitle() {
  const match = useMatch('/e/:moduleId')
  const webapps = useWebapps()
  const { name } = useVesselInfo()
  const webapp = webapps.find(
    (app) => toSafeModuleId(app.name) === match?.params.moduleId
  )
  const title = match
    ? webapp?.signalk?.displayName || webapp?.name || match.params.moduleId
    : name

  useEffect(() => {
    document.title = title || 'Signal K Server'
  }, [title])

  return null
}
