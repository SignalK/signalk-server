import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Card, CardHeader, CardBody, CardFooter } from 'reactstrap'

class SourcePreferences extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <Card>
        <CardHeader>Source Preferences</CardHeader>
        <CardBody>${JSON.stringify(this.props.sourcePriorities)}</CardBody>
        <CardFooter></CardFooter>
      </Card>
    )
  }
}

const mapStateToProps = ({ sourcePriorities  }) => ({ sourcePriorities })

export default connect(mapStateToProps)(SourcePreferences)
