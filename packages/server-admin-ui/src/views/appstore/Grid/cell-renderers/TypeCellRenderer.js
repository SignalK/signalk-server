import React, { useState } from 'react'

export default function TypeCellRenderer(props) {
  return (
    <div className="cell__renderer cell-type center">
      {props.data.isPlugin && <span className="tag">Plugin</span>}
      {(props.data.isWebapp || props.data.isEmbeddableWebapp) && (
        <span className="tag">App</span>
      )}
    </div>
  )
}
