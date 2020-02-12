import React, { Component } from 'react'
import Form from 'react-jsonschema-form-bs4'


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
      enableDebug: {
        type: 'boolean',
        title: 'Enable Debug',
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
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      onSubmit={submitData => {
        onSubmit(submitData.formData)
      }}
    />
  )
}
