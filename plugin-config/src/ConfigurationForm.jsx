import React, {Component} from "react"
import {render} from "react-dom"
import keys from 'lodash.keys'

import Form from "react-jsonschema-form";

export default(props) => {
  const schema = JSON.parse(JSON.stringify(props.plugin.schema))
  const topSchema = {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Active",
        default: false
      },
      configuration: {
        type: "object",
        title: schema.title,
        description: schema.description,
        type: "object",
        properties: schema.properties
      }
    }
  }

  return <Form schema={topSchema} formData={props.plugin.data || {}} onSubmit={submitData => {
    props.onSubmit(submitData.formData)
  }}/>
}
