import React, { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import { useLoginStatus } from '../../store'
import {
  fetchUsageStatistics,
  saveUsageStatistics,
  UsageStatisticsDescription,
  UsageStatisticsStatus
} from '../ServerConfig/UsageStatistics'

const UsageStatisticsPrompt: React.FC = () => {
  const loginStatus = useLoginStatus()
  const isAdmin =
    loginStatus.authenticationRequired === false ||
    loginStatus.userLevel === 'admin'
  const [answered, setAnswered] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (isAdmin) {
      fetchUsageStatistics<UsageStatisticsStatus>().then((status) =>
        setAnswered(status.answered)
      )
    }
  }, [isAdmin])

  const answer = (enabled: boolean) => {
    setSaving(true)
    setError(undefined)
    saveUsageStatistics(enabled)
      .then((status) => setAnswered(status.answered))
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false))
  }

  if (answered) {
    return null
  }

  return (
    <Card className="mb-3">
      <Card.Header>Help us help you</Card.Header>
      <Card.Body>
        <UsageStatisticsDescription />
        <Form.Text muted as="div">
          You can change this later under Server → Settings.
        </Form.Text>
        {error && (
          <Alert variant="danger" className="mt-2 mb-0">
            {error}
          </Alert>
        )}
      </Card.Body>
      <Card.Footer>
        <Button
          size="sm"
          variant="primary"
          disabled={saving}
          onClick={() => answer(true)}
        >
          Share
        </Button>{' '}
        <Button
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={() => answer(false)}
        >
          Don&apos;t share
        </Button>
      </Card.Footer>
    </Card>
  )
}

export default UsageStatisticsPrompt
