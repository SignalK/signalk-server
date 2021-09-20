import React, { Component } from 'react'
import Form from 'react-jsonschema-form-bs4'

export default ({ plugin, onSubmit }) => {
  const schema = JSON.parse(JSON.stringify(plugin.schema))
  var uiSchema = {}

  if (typeof plugin.uiSchema !== 'undefined') {
    uiSchema['configuration'] = JSON.parse(JSON.stringify(plugin.uiSchema))
  }

  const topSchema = {
    type: 'object',
    properties: {
      configuration: {
        type: 'object',
        title: ' ',
        description: schema.description,
        type: 'object',
        properties: schema.properties,
      },
    },
  }

  if (plugin.statusMessage) {
    topSchema.description = `Status: ${plugin.statusMessage}`
  }

  const { enabled, enableLogging, enableDebug } = plugin.data
  return (
    <Form
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      onSubmit={(submitData) => {
        onSubmit({
          ...submitData.formData,
          enabled,
          enableLogging,
          enableDebug,
        })
      }}
    />
  )
}
