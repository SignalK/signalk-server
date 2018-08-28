import React, { Component } from 'react'
import { render } from 'react-dom'
import keys from 'lodash.keys'

import Form from 'react-jsonschema-form'
//import fields from "react-jsonschema-form-extras";

import CollapsibleField from "react-jsonschema-form-extras/lib/CollapsibleField"


export default ({plugin, onSubmit}) => {
  const schema = JSON.parse(JSON.stringify(plugin.schema))
  var uiSchema = {}

  if (typeof plugin.uiSchema !== 'undefined') {
    uiSchema['configuration'] = JSON.parse(
      JSON.stringify(plugin.uiSchema)
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

  if (plugin.statusMessage) {
    topSchema.description = `Status: ${plugin.statusMessage}`
  }

  return (
    <Form
      fields={{collapsible:CollapsibleField}}
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      onSubmit={submitData => {
        onSubmit(submitData.formData)
      }}
    />
  )
}
