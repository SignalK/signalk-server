import React from 'react'
import {
  Row,
  Col,
  Card,
  CardBody,
  CardTitle,
  CardText,
  Button,
  Badge
} from 'reactstrap'
import {
  faMap,
  faTachometerAlt,
  faSpinner,
  faCheck,
  faRotateRight,
  faCog,
  faQuestionCircle,
  faTowerBroadcast,
  faMobileAlt,
  faNetworkWired
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const BUNDLE_ICONS = {
  admin: faCog,
  plotter: faMap,
  dashboard: faTachometerAlt,
  nmea: faNetworkWired,
  bluetooth: faTowerBroadcast,
  wilhelmsk: faMobileAlt
}

function BundleCard({ bundle, selected, installed, onToggle }) {
  const icon = BUNDLE_ICONS[bundle.id] || faQuestionCircle
  const isSelected = selected
  const isInstalled = installed

  return (
    <Card
      className={`bundle-card h-100 ${isSelected ? 'border-primary' : ''}`}
      style={{
        cursor: 'pointer',
        borderWidth: isSelected ? '2px' : '1px'
      }}
      onClick={() => onToggle(bundle)}
    >
      <CardBody className="d-flex flex-column">
        {isInstalled && (
          <Badge
            color="success"
            className="position-absolute"
            style={{ top: '10px', right: '10px' }}
          >
            <FontAwesomeIcon icon={faCheck} className="mr-1" />
            Installed
          </Badge>
        )}
        <div className="text-center mb-3">
          <FontAwesomeIcon
            icon={icon}
            size="3x"
            className={isSelected ? 'text-primary' : 'text-secondary'}
          />
        </div>
        <CardTitle tag="h5" className="text-center">
          {bundle.name}
        </CardTitle>
        <CardText className="text-muted flex-grow-1">
          {bundle.description}
        </CardText>
        <div className="text-center text-muted small mb-3">
          {bundle.plugins.length} packages
        </div>
        {isInstalled ? (
          <Button
            color={isSelected ? 'primary' : 'outline-secondary'}
            block
            onClick={(e) => {
              e.stopPropagation()
              onToggle(bundle)
            }}
          >
            <FontAwesomeIcon icon={faRotateRight} className="mr-2" />
            {isSelected ? 'Selected' : 'Reinstall'}
          </Button>
        ) : (
          <Button
            color={isSelected ? 'primary' : 'outline-primary'}
            block
            onClick={(e) => {
              e.stopPropagation()
              onToggle(bundle)
            }}
          >
            {isSelected ? (
              <>
                <FontAwesomeIcon icon={faCheck} className="mr-2" />
                Selected
              </>
            ) : (
              'Select'
            )}
          </Button>
        )}
      </CardBody>
    </Card>
  )
}

export default function BundleSelection({
  bundles,
  loading,
  selectedBundles,
  installedBundles,
  onToggleBundle,
  onContinue
}) {
  if (loading) {
    return (
      <div className="text-center py-5">
        <FontAwesomeIcon
          icon={faSpinner}
          spin
          size="2x"
          className="text-primary"
        />
        <p className="mt-3 text-muted">Loading bundles...</p>
      </div>
    )
  }

  if (!bundles || bundles.length === 0) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">No bundles available.</p>
      </div>
    )
  }

  const selectedCount = selectedBundles.length

  return (
    <div className="bundle-selection">
      <h4 className="mb-4">Choose Bundles to Install</h4>
      <p className="text-muted mb-4">
        Select one or more bundles that match your use case. You can always
        install additional plugins later from the App Store.
      </p>

      <Row>
        {bundles.map((bundle) => (
          <Col key={bundle.id} md={6} lg={4} className="mb-4">
            <BundleCard
              bundle={bundle}
              selected={selectedBundles.includes(bundle.id)}
              installed={installedBundles.includes(bundle.id)}
              onToggle={onToggleBundle}
            />
          </Col>
        ))}
      </Row>

      <div className="d-flex justify-content-between align-items-center mt-4">
        <span className="text-muted">
          {selectedCount === 0
            ? 'No bundles selected'
            : `${selectedCount} bundle${selectedCount > 1 ? 's' : ''} selected`}
        </span>
        <Button
          color="primary"
          size="lg"
          disabled={selectedCount === 0}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
