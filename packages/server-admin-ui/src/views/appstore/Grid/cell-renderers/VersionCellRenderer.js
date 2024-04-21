import React from 'react'

export default function NameCellRenderer(props) {
  return (
    <div className="cell__renderer cell-version">
      <div className="version__container">
        <span className="version">
          v{props.data.installedVersion || props.data.version}
        </span>
        {/* &nbsp; ({props.data.updated.substring(0, 10)}) */}
        {props.data.newVersion && (
          <span className="version version--update">
            v{props.data.newVersion}
          </span>
        )}
      </div>
    </div>
  )
}
