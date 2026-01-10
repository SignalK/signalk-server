import React, { useState, useEffect } from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardBody,
  CardHeader,
  Progress,
  Button,
  Alert,
  ListGroup,
  ListGroupItem,
  Badge
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
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

// These plugins come pre-installed with the server (plugin IDs, not npm package names)
const BUNDLED_PLUGINS = ['resources-provider', 'course-provider']

function Wizard({ wizardStatus, installedPlugins }) {
  // Skip welcome screen if user has installed plugins beyond the bundled ones
  const userInstalledPlugins = installedPlugins
    ? installedPlugins.filter((p) => !BUNDLED_PLUGINS.includes(p.id))
    : []
  const hasUserPlugins = userInstalledPlugins.length > 0
  const [step, setStep] = useState(
    hasUserPlugins ? WIZARD_STEPS.SELECT_BUNDLE : WIZARD_STEPS.WELCOME
  )
  const [bundles, setBundles] = useState([])
  const [selectedBundleIds, setSelectedBundleIds] = useState([])
  const [installedBundleIds, setInstalledBundleIds] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch bundles on mount
  useEffect(() => {
    fetchBundles()
  }, [])

  // Detect installed bundles when bundles or installedPlugins change
  useEffect(() => {
    if (bundles.length > 0 && installedPlugins) {
      // Use packageName (npm package name) for comparison, not id (plugin id)
      const installedPackageNames = installedPlugins.map((p) => p.packageName)
      const installed = bundles
        .filter((bundle) => {
          const requiredPlugins = bundle.plugins.filter((p) => p.required)
          if (requiredPlugins.length > 0) {
            // Bundle has required plugins: all must be installed
            return requiredPlugins.every((p) =>
              installedPackageNames.includes(p.name)
            )
          } else {
            // Bundle has only optional plugins: any one installed counts
            return bundle.plugins.some((p) =>
              installedPackageNames.includes(p.name)
            )
          }
        })
        .map((b) => b.id)
      setInstalledBundleIds(installed)
    }
  }, [bundles, installedPlugins])

  // Watch for installation status changes
  useEffect(() => {
    if (wizardStatus) {
      if (wizardStatus.state === 'complete') {
        setStep(WIZARD_STEPS.COMPLETE)
      } else if (wizardStatus.state === 'error') {
        setStep(WIZARD_STEPS.COMPLETE)
      }
    }
  }, [wizardStatus])

  const fetchBundles = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${window.serverRoutesPrefix}/wizard/bundles`,
        {
          credentials: 'include'
        }
      )
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

  const handleToggleBundle = (bundle) => {
    setSelectedBundleIds((prev) => {
      if (prev.includes(bundle.id)) {
        return prev.filter((id) => id !== bundle.id)
      } else {
        return [...prev, bundle.id]
      }
    })
  }

  const handleContinue = () => {
    if (selectedBundleIds.length > 0) {
      setStep(WIZARD_STEPS.CONFIRM)
    }
  }

  const getSelectedBundles = () => {
    return bundles.filter((b) => selectedBundleIds.includes(b.id))
  }

  const getMergedPackages = () => {
    const selectedBundles = getSelectedBundles()
    const plugins = new Map()

    selectedBundles.forEach((bundle) => {
      bundle.plugins.forEach((p) => {
        if (!plugins.has(p.name)) {
          plugins.set(p.name, { ...p, bundles: [bundle.name] })
        } else {
          plugins.get(p.name).bundles.push(bundle.name)
        }
      })
    })

    return {
      plugins: Array.from(plugins.values())
    }
  }

  const handleInstall = async () => {
    if (selectedBundleIds.length === 0) return

    try {
      setStep(WIZARD_STEPS.INSTALLING)
      const response = await fetch(
        `${window.serverRoutesPrefix}/wizard/install`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ bundleIds: selectedBundleIds })
        }
      )

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
            <h2>Welcome to the Plugin Wizard</h2>
            <p className="lead text-muted mt-3">
              This wizard will help you get started by installing the right
              plugins for your use case.
            </p>
            <p className="text-muted">
              Choose from curated bundles tailored to your needs.
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
            selectedBundles={selectedBundleIds}
            installedBundles={installedBundleIds}
            onToggleBundle={handleToggleBundle}
            onContinue={handleContinue}
          />
        )

      case WIZARD_STEPS.CONFIRM: {
        const selectedBundles = getSelectedBundles()
        const { plugins } = getMergedPackages()
        const totalPackages = plugins.length

        return (
          <div className="wizard-confirm">
            <h4>Confirm Installation</h4>
            <p className="text-muted">
              You are about to install {selectedBundles.length} bundle
              {selectedBundles.length > 1 ? 's' : ''}:{' '}
              <strong>{selectedBundles.map((b) => b.name).join(', ')}</strong>
            </p>

            <Card className="mb-4">
              <CardHeader>
                <strong>{totalPackages} packages to install</strong>
              </CardHeader>
              <CardBody>
                {plugins.length > 0 && (
                  <ListGroup>
                    {plugins.map((p) => (
                      <ListGroupItem
                        key={p.name}
                        className="d-flex justify-content-between align-items-center py-2"
                      >
                        <div>
                          <code>{p.name}</code>
                          {p.setAsLandingPage && (
                            <Badge color="success" className="ml-2">
                              Landing Page
                            </Badge>
                          )}
                          {p.description && (
                            <span className="text-muted ml-2">
                              - {p.description}
                            </span>
                          )}
                        </div>
                        {p.bundles.length > 1 && (
                          <Badge color="secondary" pill>
                            {p.bundles.length} bundles
                          </Badge>
                        )}
                      </ListGroupItem>
                    ))}
                  </ListGroup>
                )}

                {plugins.length === 0 && (
                  <p className="text-muted mb-0">
                    No additional plugins to install.
                  </p>
                )}
              </CardBody>
            </Card>

            <div className="d-flex justify-content-between">
              <Button color="secondary" onClick={handleBack}>
                Back
              </Button>
              <Button
                color="primary"
                onClick={handleInstall}
                disabled={totalPackages === 0}
              >
                <FontAwesomeIcon icon={faCheck} className="mr-2" />
                Install {totalPackages} Package{totalPackages !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )
      }

      case WIZARD_STEPS.INSTALLING:
        return <InstallProgress status={wizardStatus} />

      case WIZARD_STEPS.COMPLETE:
        return (
          <WizardComplete
            bundles={getSelectedBundles()}
            status={wizardStatus}
            onRestart={handleRestart}
          />
        )

      default:
        return null
    }
  }

  const getStepNumber = () => {
    // If user has plugins, we skip welcome so adjust numbering
    const offset = hasUserPlugins ? 1 : 0
    switch (step) {
      case WIZARD_STEPS.WELCOME:
        return 1
      case WIZARD_STEPS.SELECT_BUNDLE:
        return 2 - offset
      case WIZARD_STEPS.CONFIRM:
        return 3 - offset
      case WIZARD_STEPS.INSTALLING:
        return 4 - offset
      case WIZARD_STEPS.COMPLETE:
        return hasUserPlugins ? 4 : 5
      default:
        return 1
    }
  }

  const getTotalSteps = () => {
    return hasUserPlugins ? 4 : 5
  }

  return (
    <div className="wizard animated fadeIn">
      <Card>
        <CardHeader>
          <strong>Plugin Wizard</strong>
          <div className="float-right text-muted">
            Step {getStepNumber()} of {getTotalSteps()}
          </div>
        </CardHeader>
        <CardBody>
          <Progress
            value={(getStepNumber() / getTotalSteps()) * 100}
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
  wizardStatus: state.wizardStatus,
  installedPlugins: state.plugins
})

export default connect(mapStateToProps)(Wizard)
