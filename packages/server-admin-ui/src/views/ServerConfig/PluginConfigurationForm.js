import React, { Suspense } from 'react'
const Form = React.lazy(() => import('react-jsonschema-form-bs4'))
const Foobar = React.lazy(() => import('./Foo'))


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
    <Suspense fallback={<div>Loading...</div>}>
    <Form
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      onSubmit={submitData => {
        onSubmit(submitData.formData)
      }}
    />
    <Foobar/>
    </Suspense>
  )
}
