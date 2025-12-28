import React from 'react'
import {
  Row,
  Col,
  Card,
  CardBody,
  CardTitle,
  CardText,
  Button,
  Spinner
} from 'reactstrap'
import {
  faMap,
  faTachometerAlt,
  faDatabase,
  faAnchor,
  faStar,
  faMinimize,
  faPlug
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const BUNDLE_ICONS = {
  minimal: faMinimize,
  plotter: faMap,
  dashboard: faTachometerAlt,
  datalogger: faDatabase,
  anchor: faAnchor,
  nmea: faPlug,
  full: faStar
}

function BundleCard({ bundle, onSelect }) {
  const icon = BUNDLE_ICONS[bundle.id] || faStar

  return (
    <Card
      className="bundle-card h-100"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(bundle)}
    >
      <CardBody className="d-flex flex-column">
        <div className="text-center mb-3">
          <FontAwesomeIcon
            icon={icon}
            size="3x"
            className="text-primary"
          />
        </div>
        <CardTitle tag="h5" className="text-center">
          {bundle.name}
        </CardTitle>
        <CardText className="text-muted flex-grow-1">
          {bundle.description}
        </CardText>
        <div className="text-center text-muted small mb-3">
          {bundle.plugins.length} plugins, {bundle.webapps.length} webapps
        </div>
        <Button color="primary" block>
          Select
        </Button>
      </CardBody>
    </Card>
  )
}

export default function BundleSelection({ bundles, loading, onSelect }) {
  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
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

  return (
    <div className="bundle-selection">
      <h4 className="mb-4">Choose a Bundle</h4>
      <p className="text-muted mb-4">
        Select a bundle that matches your use case. You can always install
        additional plugins later from the App Store.
      </p>

      <Row>
        {bundles.map((bundle) => (
          <Col key={bundle.id} md={6} lg={4} className="mb-4">
            <BundleCard bundle={bundle} onSelect={onSelect} />
          </Col>
        ))}
      </Row>
    </div>
  )
}
