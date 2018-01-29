import React, { Component } from 'react'
import { render } from 'react-dom'
import keys from 'lodash.keys'

import Form from 'react-jsonschema-form'

export default props => {
  const schema = JSON.parse(JSON.stringify(props.plugin.schema))
  var uiSchema = {}

  if (typeof props.plugin.uiSchema !== 'undefined') {
    uiSchema['configuration'] = JSON.parse(
      JSON.stringify(props.plugin.uiSchema)
    )
  }

  const topSchema = {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        title: 'Active',
        default: false
      },
      enableLogging: {
        type: 'boolean',
        title: 'Enable Logging',
        default: false
      },
      configuration: {
        type: 'object',
        title: ' ',
        description: schema.description,
        type: 'object',
        properties: schema.properties
      }
    }
  }

  return (
    <Form
      schema={topSchema}
      uiSchema={uiSchema}
      formData={props.plugin.data || {}}
      onSubmit={submitData => {
        props.onSubmit(submitData.formData)
      }}
    />
  )
}
