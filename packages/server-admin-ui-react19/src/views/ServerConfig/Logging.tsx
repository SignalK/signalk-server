import React, { useState, useEffect, useCallback } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import ListGroup from 'react-bootstrap/ListGroup'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'

const Logging: React.FC = () => {
  const [hasData, setHasData] = useState(false)
  const [authorized, setAuthorized] = useState(true)
  const [logfileslist, setLogfileslist] = useState<string[]>([])

  const fetchLogfileList = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/logfiles/`, {
      credentials: 'include'
    })
      .then((response) => {
        if (!response.ok) {
          setAuthorized(false)
          return null
        }
        return response.json()
      })
      .then((logfiles: string[] | null) => {
        if (logfiles) {
          logfiles.sort()
          setLogfileslist(logfiles)
          setHasData(true)
          setAuthorized(true)
        }
      })
  }, [])

  useEffect(() => {
    fetchLogfileList()
  }, [fetchLogfileList])

  const logfilesToRows = useCallback((logfiles: string[]) => {
    // skserver-raw_2017-03-04T14.log
    // 012345678901234567890123456789012
    const datesWithHours = logfiles.reduce<Record<string, string[]>>(
      (acc, logfile) => {
        const date = logfile.substr(13, 10)
        const hour = logfile.substr(24, 2)
        if (!acc[date]) {
          acc[date] = []
        }
        acc[date].push(hour)
        return acc
      },
      {}
    )

    return Object.keys(datesWithHours).map((date) => {
      return (
        <ListGroup.Item key={date}>
          {date}
          {datesWithHours[date].map((hour) => (
            <span key={`${date}-${hour}`}>
              <a
                href={`${window.serverRoutesPrefix}/logfiles/skserver-raw_${date}T${hour}.log`}
              >
                <Button className="m-2">{hour}</Button>
              </a>
            </span>
          ))}
        </ListGroup.Item>
      )
    })
  }, [])

  if (!authorized) {
    return <div className="animated fadeIn">Not Authorized</div>
  }

  if (!hasData) {
    return null
  }

  return (
    <div className="animated fadeIn">
      <Row>
        <Col sm="12" xl="12">
          <Card>
            <Card.Header>
              <FontAwesomeIcon icon={faAlignJustify} />{' '}
              <strong>Data Logfiles</strong>
            </Card.Header>
            <Card.Body>
              <ListGroup>{logfilesToRows(logfileslist)}</ListGroup>
            </Card.Body>
            <Card.Footer>
              <small className="text-muted">
                Click button to download each logfile or
              </small>
              <a href={`${window.serverRoutesPrefix}/ziplogs`}>
                <Button className="m-2">Get all logs in one ZIP file</Button>
              </a>
            </Card.Footer>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Logging
