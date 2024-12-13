import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardFooter,
  CardBody,
  Col,
  Row,
  ListGroup,
  ListGroupItem,
} from 'reactstrap'

function fetchLogfileList() {
  const okResponse = fetch(`${window.serverRoutesPrefix}/logfiles/`, {
    credentials: 'include',
  }).then((response) => {
    if (!response.ok) {
      this.setState({ authorized: false })
      return false
    }
    return response
  })

  okResponse &&
    okResponse
      .then((response) => {if (response) response.json()})
      .then((logfileslist) => {
        logfileslist.sort()
        this.setState({ logfileslist, hasData: true, authorized: true })
      })
}

class Settings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
      authorized: true,
    }

    this.fetchLogfileList = fetchLogfileList.bind(this)
  }

  componentDidMount() {
    this.fetchLogfileList()
  }

  render() {
    if (!this.state.authorized) {
      return <div className="animated fadeIn">Not Authorized</div>
    }

    return (
      this.state.hasData && (
        <div className="animated fadeIn">
          <Row>
            <Col sm="12" xl="12">
              <Card>
                <CardHeader>
                  <i className="fa fa-align-justify" />
                  <strong>Data Logfiles</strong>
                </CardHeader>
                <CardBody>
                  <ListGroup>
                    {this.logfilesToRows(this.state.logfileslist)}
                  </ListGroup>
                </CardBody>
                <CardFooter>
                  <small className="text-muted">
                    Click button to download each logfile or
                  </small>
                  <a href={`${window.serverRoutesPrefix}/ziplogs`}>
                    <Button className="m-2">
                      Get all logs in one ZIP file
                    </Button>
                  </a>
                </CardFooter>
              </Card>
            </Col>
          </Row>
        </div>
      )
    )
  }

  logfilesToRows(logfiles) {
    // skserver-raw_2017-03-04T14.log
    // 012345678901234567890123456789012
    const datesWithHours = logfiles.reduce((acc, logfile) => {
      const date = logfile.substr(13, 10)
      const hour = logfile.substr(24, 2)
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(hour)
      return acc
    }, {})

    return Object.keys(datesWithHours).map((date, i) => {
      return (
        <ListGroupItem key={i}>
          {date}
          {datesWithHours[date].map((hour, i) => (
            <span key={i}>
              <a
                href={`${window.serverRoutesPrefix}/logfiles/skserver-raw_${date}T${hour}.log`}
              >
                <Button className="m-2">{hour}</Button>
              </a>
            </span>
          ))}
        </ListGroupItem>
      )
    })
  }
}

export default connect()(Settings)
