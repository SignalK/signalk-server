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
  ListGroupItem
} from 'reactstrap'

function fetchLogfileList () {
  fetch(`/logfiles/`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(logfileslist => {
      logfileslist.sort()
      this.setState({ logfileslist, hasData: true })
    })
}

class Settings extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false
    }

    this.fetchLogfileList = fetchLogfileList.bind(this)
  }

  componentDidMount () {
    this.fetchLogfileList()
  }

  render () {
    return (
      this.state.hasData &&
      <div className='animated fadeIn'>
        <Row>
          <Col sm='12' xl='12'>
            <Card>
              <CardHeader>
                <i className='fa fa-align-justify' /><strong>Log files</strong>
              </CardHeader>
              <CardBody>
                <ListGroup>
                  {logfilesToRows(this.state.logfileslist)}
                </ListGroup>
              </CardBody>
              <CardFooter>
                <small className='text-muted'>
                  Click button to download each logfile
                </small>
              </CardFooter>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }
}
// signalk-rawdata.log.2017-03-04T14
// 012345678901234567890123456789012
function logfilesToRows (logfiles) {
  const datesWithHours = logfiles.reduce((acc, logfile) => {
    const date = logfile.substr(20, 10)
    const hour = logfile.substr(31, 2)
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
        {datesWithHours[date].map(hour => (
          <a href={`/logfiles/signalk-rawdata.log.${date}T${hour}`}>
            <Button className='m-2'>{hour}</Button>
          </a>
        ))}
      </ListGroupItem>
    )
  })
}

export default connect()(Settings)
