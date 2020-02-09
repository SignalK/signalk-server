import React, { Component } from 'react'
import ReactHtmlParser from 'react-html-parser'
import { connect } from 'react-redux'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  InputGroup,
  InputGroupAddon,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Table
} from 'reactstrap'

class ServerLogs extends Component {
  constructor (props) {
    super(props)
    this.state = {
      hasData: true
    }

    this.handleDebug = this.handleDebug.bind(this)
  }

  componentDidMount () {
  }

  handleDebug (event) {
    fetch(`${window.serverRoutesPrefix}/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: event.target.value }),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        this.props.log.debugEnabled = event.target.value
      })
  }

  render () {
    return (
      this.state.hasData && (
        <div className='animated fadeIn'>
          <Card>
            <CardBody>
              <Form
                action=''
                method='post'
                encType='multipart/form-data'
                className='form-horizontal'
          >

          <FormGroup row>
          <Col xs='3' md='2'>
            <Label htmlFor='select'>Debug</Label>
          </Col>
          <Col xs='12' md='12'>
                              <Input
                                type='text'
                                name='debug'
                                onChange={this.handleDebug}
                                value={this.props.log.debugEnabled}
                              />
          </Col>
          </FormGroup>

          <LogList value={this.props.log} />
              </Form>
            </CardBody>
            <CardFooter>
            </CardFooter>
          </Card>
        </div>
      )
    )
  }
}

class LogList extends Component {
  render() {
    return (
      <Table hover responsive bordered striped size="sm">
            <thead>
                <tr>
                <th>Log</th>
              </tr>
            </thead>
            <tbody>

      {this.props.value.entries && this.props.value.entries.map((log, index) => {
        let levelClass
        levelClass = 'text-info'

            return (
                <tr key={index}>
                <td>{ ReactHtmlParser(log) }</td>
                </tr>
            )
            })
            }
      
            </tbody>
          </Table>
    )
  }
}

export default connect(({log, debug}) => ({log, debug}))(ServerLogs)
