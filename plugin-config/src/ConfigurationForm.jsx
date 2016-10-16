import React, { Component } from "react";
import { render } from "react-dom";

import Form from "react-jsonschema-form";


const log = (type) => console.log.bind(console, type);

export default (props) => (
  <Form schema={props.schema}
        onChange={log("changed")}
        onSubmit={log("submitted")}
        onError={log("errors")} />
)
