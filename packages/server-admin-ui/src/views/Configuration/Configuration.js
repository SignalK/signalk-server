import React, { Component } from 'react'
import { connect } from 'react-redux'

import JSONSchemaBridge from 'uniforms/JSONSchemaBridge'
import AutoForm from 'uniforms-bootstrap4/AutoForm'

const schema = {
  type: "object",
  properties: {
    zones: {
      type: "array",
      title: " ",
      items: {
        title: "One Signal K path with zones (zone = upper and lower limit with metadata)",
        type: "object",
        properties: {
          "active": {
            title: "Active",
            type: "boolean",
            default: true
          },
          "key": {
            title: "Path",
            type: "string",
            default: "",
            "enum": ["foo", "bar"]
          },
          "zones": {
            "type": "array",
            "title": " ",
            "description": "Zones",
            "items": {
              "type": "object",
              "title": "Zone",
              "required": ["state"],
              "properties": {
                "lower": {
                  "id": "lower",
                  "type": "number",
                  "title": "Lower",
                  "description": "The lowest value in this zone",
                  "name": "lower"
                },

                "upper": {
                  "id": "upper",
                  "type": "number",
                  "title": "Upper",
                  "description": "The highest value in this zone",
                  "name": "upper"
                },

                "state": {
                  "type": "string",
                  "title": "Alarm State",
                  "description": "The alarm state when the value is in this zone.",
                  "default": "normal",
                  "enum": ["normal", "alert", "warn", "alarm", "emergency"]
                },

                "method": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "enum": ["visual", "sound"]
                  },
                  default: ["visual", "sound"]
                },

                "message": {
                  "id": "message",
                  "type": "string",
                  "title": "Message",
                  "description": "The message to display for the alarm.",
                  "default": ""
                }
              }
            }
          }
        }
      }
    }
  }
}

// const schema = {
//   title: 'Person',
//   type: 'object',
//   properties: {
//       firstName: {
//           type: 'string'
//       },
//       lastName: {
//           type: 'string'
//       },
//       age: {
//           description: 'Age in years',
//           type: 'integer',
//           minimum: 0
//       },
//       nicknames: {
//           "type": "array",
//           "items": {
//             "type": "string"
//         }        
//       }
//   },
//   required: ['firstName', 'lastName']
// }

import Ajv              from 'ajv';
const validator = new Ajv({allErrors: true, useDefaults: true}).compile(schema)
const schemaValidator = model => {
  validator(model);

  if (validator.errors && validator.errors.length) {
      throw {details: validator.errors};
  }
}

const bridge = new JSONSchemaBridge(schema, schemaValidator)

class Dashboard extends Component {
  render () {
    const { deltaRate } = this.props.serverStatistics || { deltaRate: 0 }
    const divStyle = {
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      bottom: '10px',
      top: '110px',
      right: '10px',
      left: '210px'
    }
    const iframeStyle = {
      flexGrow: '1'
    }
    return (
      <div>
        <span className="badge badge-primary badge-pill">Default Label</span>
      <AutoForm schema={bridge}/>
      </div>
    )
  }
}

export default connect(({ serverStatistics }) => ({ serverStatistics }))(
  Dashboard
)
