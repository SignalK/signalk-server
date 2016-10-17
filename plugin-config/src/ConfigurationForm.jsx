import React, {Component} from "react";
import {render} from "react-dom";

import Form from "react-jsonschema-form";

export default(props) => (
  <Form
    schema={props.plugin.schema}
    formData={props.plugin.data || {}}
    onSubmit={submitData => {
      props.onSubmit(submitData.formData)
    }
    }
  />
)
