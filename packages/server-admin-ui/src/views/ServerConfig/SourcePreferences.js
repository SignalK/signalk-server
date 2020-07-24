import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Card, CardHeader, CardBody, CardFooter } from 'reactstrap'

export default class SourcePreferences extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <Card>
        <CardHeader>Source Preferences</CardHeader>
        <CardBody></CardBody>
        <CardFooter></CardFooter>
      </Card>
    )
  }
}
