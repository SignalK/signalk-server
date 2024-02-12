import React, { useState } from 'react'

export default function TypeCellRenderer(props) {
  const [plugin, setPlugin] = useState(props.data.isPlugin)
  const [app, setApp] = useState(props.data.isWebapp)
  return (
    <div className="cell__renderer cell-type center">
      {plugin && (
        <p>
          <span className="tag">Plugin</span>
        </p>
      )}
      {app && (
        <p>
          <span className="tag">App</span>
        </p>
      )}
    </div>
  )
}
