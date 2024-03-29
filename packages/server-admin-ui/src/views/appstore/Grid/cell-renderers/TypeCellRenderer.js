import React, { useState } from 'react'

export default function TypeCellRenderer(props) {
  const [plugin, setPlugin] = useState(props.data.isPlugin)
  const [app, setApp] = useState(props.data.isWebapp)
  return (
    <div className="cell__renderer cell-type center">
      {plugin && <span className="tag">Plugin</span>}
      {app && <span className="tag">App</span>}
    </div>
  )
}
