import React, {Component} from "react"
import {render} from "react-dom"
import keys from 'lodash.keys'

import Form from "react-jsonschema-form";

export default(props) => {
  const schema = JSON.parse(JSON.stringify(props.plugin.schema))
  const uiSchema = {
    "ui:order": keys(schema.properties)
  }
  uiSchema['ui:order'].unshift('enabled')
  schema.properties.enabled = {
    type: "boolean",
    title: "Active",
    default: false
  }

  return <Form
    schema={schema}
    uiSchema={uiSchema}
    formData={props.plugin.data || {}}
    onSubmit={submitData => {
      props.onSubmit(submitData.formData)
    }
    }
  />
}
