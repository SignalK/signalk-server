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
  const okResponse = fetch(`/logfiles/`, {
    credentials: 'include'
  }).then(response => {
    if (!response.ok) {
      this.setState({ authorized: false })
      return false
    }
    return response
  })

  okResponse &&
    okResponse.then(response => response.json()).then(logfileslist => {
      logfileslist.sort()
      this.setState({ logfileslist, hasData: true, authorized: true })
    })
}

class Settings extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: false,
      authorized: true,
      chartedSailsAvailable: false
    }

    this.fetchLogfileList = fetchLogfileList.bind(this)
  }

  componentDidMount () {
    this.fetchLogfileList()
    this.checkChartedsails()
  }

  checkChartedsails() {
    fetch('http://chartedsails.com/', {mode: 'no-cors'}).then(result => {
      this.setState({chartedSailsAvailable: true})
    }).catch(e => {
      this.setState({chartedSailsAvailable: false})
    })
  }

  render () {
    if (!this.state.authorized) {
      return (
        <div className='animated fadeIn'>
          Not Authorized
        </div>
      )
    }

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
                  {this.logfilesToRows(this.state.logfileslist)}
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

  logfilesToRows (logfiles) {
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
              <a href={`/logfiles/skserver-raw_${date}T${hour}.log`}>
                <Button className='m-2'>{hour}</Button>
              </a>
            {this.state.chartedSailsAvailable && (
              <a
                title="Open in chartedsails.com"
                href={`http://chartedsails.com/?url=${location.origin}/logfiles/skserver-raw_${date}T${hour}.log`}>
                <i className="icon-map"/>
              </a>
            )}
            </span>
          ))
          }
        </ListGroupItem>
      )
    })
  }
}


export default connect()(Settings)
