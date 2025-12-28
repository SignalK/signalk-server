import React, { useState, useEffect } from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardBody,
  CardHeader,
  Progress,
  Button,
  Alert
} from 'reactstrap'
import BundleSelection from './BundleSelection'
import InstallProgress from './InstallProgress'
import WizardComplete from './WizardComplete'
import './wizard.scss'

const WIZARD_STEPS = {
  WELCOME: 'welcome',
  SELECT_BUNDLE: 'select_bundle',
  CONFIRM: 'confirm',
  INSTALLING: 'installing',
  COMPLETE: 'complete'
}

function Wizard({ wizardStatus, dispatch }) {
  const [step, setStep] = useState(WIZARD_STEPS.WELCOME)
  const [bundles, setBundles] = useState([])
  const [selectedBundle, setSelectedBundle] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch bundles on mount
  useEffect(() => {
    fetchBundles()
  }, [])

  // Watch for installation status changes
  useEffect(() => {
    if (wizardStatus) {
      if (wizardStatus.state === 'complete') {
        setStep(WIZARD_STEPS.COMPLETE)
      } else if (wizardStatus.state === 'error') {
        setError(`Installation failed: ${wizardStatus.errors.join(', ')}`)
      }
    }
  }, [wizardStatus])

  const fetchBundles = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${window.serverRoutesPrefix}/wizard/bundles`, {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch bundles')
      }
      const data = await response.json()
      setBundles(data.bundles || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBundleSelect = (bundle) => {
    setSelectedBundle(bundle)
    setStep(WIZARD_STEPS.CONFIRM)
  }

  const handleInstall = async () => {
    if (!selectedBundle) return

    try {
      setStep(WIZARD_STEPS.INSTALLING)
      const response = await fetch(`${window.serverRoutesPrefix}/wizard/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ bundleId: selectedBundle.id })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Installation failed')
      }
    } catch (err) {
      setError(err.message)
      setStep(WIZARD_STEPS.CONFIRM)
    }
  }

  const handleBack = () => {
    if (step === WIZARD_STEPS.CONFIRM) {
      setStep(WIZARD_STEPS.SELECT_BUNDLE)
    } else if (step === WIZARD_STEPS.SELECT_BUNDLE) {
      setStep(WIZARD_STEPS.WELCOME)
    }
  }

  const handleRestart = () => {
    if (confirm('Are you sure you want to restart the server?')) {
      fetch(`${window.serverRoutesPrefix}/restart`, {
        credentials: 'include',
        method: 'PUT'
      })
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case WIZARD_STEPS.WELCOME:
        return (
          <div className="wizard-welcome text-center py-5">
            <h2>Welcome to Signal K Server Setup</h2>
            <p className="lead text-muted mt-3">
              This wizard will help you get started by installing the right
              plugins and webapps for your use case.
            </p>
            <p className="text-muted">
              Choose from curated bundles or start with a minimal setup.
            </p>
            <Button
              color="primary"
              size="lg"
              className="mt-4"
              onClick={() => setStep(WIZARD_STEPS.SELECT_BUNDLE)}
            >
              Get Started
            </Button>
          </div>
        )

      case WIZARD_STEPS.SELECT_BUNDLE:
        return (
          <BundleSelection
            bundles={bundles}
            loading={loading}
            onSelect={handleBundleSelect}
          />
        )

      case WIZARD_STEPS.CONFIRM:
        return (
          <div className="wizard-confirm">
            <h4>Confirm Installation</h4>
            <p className="text-muted">
              You are about to install the <strong>{selectedBundle?.name}</strong> bundle.
            </p>
            <Card className="mb-4">
              <CardHeader>
                <strong>{selectedBundle?.name}</strong>
              </CardHeader>
              <CardBody>
                <p>{selectedBundle?.description}</p>

                {selectedBundle?.plugins.length > 0 && (
                  <>
                    <h6>Plugins to install:</h6>
                    <ul className="mb-3">
                      {selectedBundle.plugins.map((p) => (
                        <li key={p.name}>
                          <code>{p.name}</code>
                          {p.required && <span className="badge badge-info ml-2">Required</span>}
                          {p.description && <span className="text-muted ml-2">- {p.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {selectedBundle?.webapps.length > 0 && (
                  <>
                    <h6>Webapps to install:</h6>
                    <ul>
                      {selectedBundle.webapps.map((w) => (
                        <li key={w.name}>
                          <code>{w.name}</code>
                          {w.setAsLandingPage && <span className="badge badge-success ml-2">Landing Page</span>}
                          {w.description && <span className="text-muted ml-2">- {w.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {selectedBundle?.plugins.length === 0 && selectedBundle?.webapps.length === 0 && (
                  <p className="text-muted mb-0">
                    This bundle installs no additional plugins or webapps.
                    You can install them later from the App Store.
                  </p>
                )}
              </CardBody>
            </Card>

            <div className="d-flex justify-content-between">
              <Button color="secondary" onClick={handleBack}>
                Back
              </Button>
              <Button color="primary" onClick={handleInstall}>
                Install Bundle
              </Button>
            </div>
          </div>
        )

      case WIZARD_STEPS.INSTALLING:
        return (
          <InstallProgress status={wizardStatus} />
        )

      case WIZARD_STEPS.COMPLETE:
        return (
          <WizardComplete
            bundle={selectedBundle}
            status={wizardStatus}
            onRestart={handleRestart}
          />
        )

      default:
        return null
    }
  }

  const getStepNumber = () => {
    switch (step) {
      case WIZARD_STEPS.WELCOME: return 1
      case WIZARD_STEPS.SELECT_BUNDLE: return 2
      case WIZARD_STEPS.CONFIRM: return 3
      case WIZARD_STEPS.INSTALLING: return 4
      case WIZARD_STEPS.COMPLETE: return 5
      default: return 1
    }
  }

  return (
    <div className="wizard animated fadeIn">
      <Card>
        <CardHeader>
          <strong>Setup Wizard</strong>
          <div className="float-right text-muted">
            Step {getStepNumber()} of 5
          </div>
        </CardHeader>
        <CardBody>
          <Progress
            value={(getStepNumber() / 5) * 100}
            className="mb-4"
          />

          {error && (
            <Alert color="danger" className="mb-4">
              {error}
              <Button close onClick={() => setError(null)} />
            </Alert>
          )}

          {renderStepContent()}
        </CardBody>
      </Card>
    </div>
  )
}

const mapStateToProps = (state) => ({
  wizardStatus: state.wizardStatus
})

export default connect(mapStateToProps)(Wizard)
