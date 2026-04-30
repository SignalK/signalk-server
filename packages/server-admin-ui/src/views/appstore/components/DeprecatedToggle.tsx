import React from 'react'
import Form from 'react-bootstrap/Form'

interface DeprecatedToggleProps {
  count: number
  enabled: boolean
  onChange: (next: boolean) => void
}

const DeprecatedToggle: React.FC<DeprecatedToggleProps> = ({
  count,
  enabled,
  onChange
}) => {
  // Hide only when there's nothing to reveal AND the user hasn't already
  // enabled the filter. Otherwise the toggle would unmount as soon as it
  // takes effect, taking the only control that turns it back off with it.
  if (count <= 0 && !enabled) return null
  return (
    <Form.Check
      type="checkbox"
      id="appstore-show-deprecated"
      className="appstore__deprecated-toggle"
      checked={enabled}
      onChange={(e) => onChange(e.target.checked)}
      label={
        count > 0 ? (
          <span>
            Show {count} deprecated plugin{count === 1 ? '' : 's'}{' '}
            <small className="text-muted">
              (already-installed deprecated plugins are always shown)
            </small>
          </span>
        ) : (
          <span>
            Show deprecated plugins{' '}
            <small className="text-muted">(currently visible)</small>
          </span>
        )
      }
    />
  )
}

export default DeprecatedToggle
