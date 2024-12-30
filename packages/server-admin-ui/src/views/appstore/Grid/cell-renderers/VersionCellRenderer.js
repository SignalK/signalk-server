import React from 'react'

export default function NameCellRenderer(props) {
  return (
    <div className="cell__renderer cell-version center">
      <div className="version__container">
        <span className="version">
          v
          {props.data.newVersion
            ? props.data.installedVersion
            : props.data.version}
        </span>

        {/* 
         // TODO: Maybe think about a better way to display this information
        &nbsp; ({props.data.updated.substring(0, 10)}) */}
        {props.data.newVersion && (
          <span className="version version--update">
            v{props.data.newVersion}
          </span>
        )}
      </div>
      <p className="last-update">({props.data.updated.substring(0, 10)})</p>

      <div className="last-update"></div>
    </div>
  )
}
