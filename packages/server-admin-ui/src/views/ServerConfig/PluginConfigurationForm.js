import React from 'react'
import { withTheme } from '@rjsf/core'
import { Theme as Bootstrap4Theme } from '@rjsf/bootstrap-4'
import validator from '@rjsf/validator-ajv8'
import { getTemplate, getUiOptions } from '@rjsf/utils'

const Form = withTheme(Bootstrap4Theme)

// Custom ArrayFieldItemTemplate matching old react-jsonschema-form-bs4 layout
const ArrayFieldItemTemplate = (props) => {
  const {
    children,
    disabled,
    hasToolbar,
    hasMoveUp,
    hasMoveDown,
    hasRemove,
    index,
    onDropIndexClick,
    onReorderClick,
    readonly,
    registry,
    uiSchema
  } = props

  const { MoveUpButton, MoveDownButton, RemoveButton } = registry.templates.ButtonTemplates

  return (
    <div className="row array-item">
      <div className="col-9">
        {children}
      </div>
      <div className="col-3 array-item-toolbox">
        {hasToolbar && (
          <div className="btn-group" style={{ display: 'flex', justifyContent: 'space-around' }}>
            {(hasMoveUp || hasMoveDown) && (
              <MoveUpButton
                className="array-item-move-up"
                style={{ flex: '1 1 0%', paddingLeft: 6, paddingRight: 6, fontWeight: 'bold' }}
                disabled={disabled || readonly || !hasMoveUp}
                onClick={onReorderClick(index, index - 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {(hasMoveUp || hasMoveDown) && (
              <MoveDownButton
                className="array-item-move-down"
                style={{ flex: '1 1 0%', paddingLeft: 6, paddingRight: 6, fontWeight: 'bold' }}
                disabled={disabled || readonly || !hasMoveDown}
                onClick={onReorderClick(index, index + 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {hasRemove && (
              <RemoveButton
                className="array-item-remove"
                style={{ flex: '1 1 0%', paddingLeft: 6, paddingRight: 6, fontWeight: 'bold' }}
                disabled={disabled || readonly}
                onClick={onDropIndexClick(index)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Custom FieldTemplate matching old react-jsonschema-form-bs4 layout
const FieldTemplate = (props) => {
  const {
    id,
    classNames,
    style,
    label,
    help,
    required,
    description,
    errors,
    children,
    displayLabel,
    schema
  } = props

  const isCheckbox = schema.type === 'boolean'

  // Extract text from description if it's wrapped in JSX
  let descriptionText = description
  if (description && typeof description === 'object' && description.props) {
    // Description is JSX, try to extract text content
    const extractText = (node) => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (node.props && node.props.children) return extractText(node.props.children)
      return ''
    }
    descriptionText = extractText(description).trim()
  }

  // Only show description if it has actual content
  const hasDescription = descriptionText && descriptionText.length > 0

  return (
    <div className={classNames} style={style}>
      {displayLabel && label && !isCheckbox && (
        <label htmlFor={id}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {hasDescription && (
        <p id={`${id}__description`} className="field-description">
          {descriptionText}
        </p>
      )}
      {children}
      {errors}
      {help}
    </div>
  )
}

// Custom ObjectFieldTemplate matching old react-jsonschema-form-bs4 layout
const ObjectFieldTemplate = (props) => {
  const { title, description, properties, idSchema } = props

  return (
    <fieldset id={idSchema.$id}>
      {title && (
        <legend id={`${idSchema.$id}__title`}>{title}</legend>
      )}
      {description && (
        <p id={`${idSchema.$id}__description`} className="field-description">
          {description}
        </p>
      )}
      {properties.map((prop) => prop.content)}
    </fieldset>
  )
}

// Custom ArrayFieldTemplate matching old react-jsonschema-form-bs4 layout
const ArrayFieldTemplate = (props) => {
  const {
    canAdd,
    disabled,
    idSchema,
    uiSchema,
    items,
    onAddClick,
    readonly,
    registry,
    schema,
    title
  } = props

  const uiOptions = getUiOptions(uiSchema)
  const ArrayFieldItemTemplate = getTemplate('ArrayFieldItemTemplate', registry, uiOptions)
  const { ButtonTemplates: { AddButton } } = registry.templates

  return (
    <fieldset className="field field-array field-array-of-object" id={idSchema.$id}>
      {(uiOptions.title || title) && (
        <legend id={`${idSchema.$id}__title`}>
          {uiOptions.title || title}
        </legend>
      )}
      {(uiOptions.description || schema.description) && (
        <div className="field-description">
          {uiOptions.description || schema.description}
        </div>
      )}
      <div className="array-item-list">
        {items && items.map(({ key, ...itemProps }) => (
          <ArrayFieldItemTemplate key={key} {...itemProps} />
        ))}
      </div>
      {canAdd && (
        <div className="row">
          <p className="col-3 offset-9 text-right array-item-add">
            <AddButton
              className="btn-add col-12"
              onClick={onAddClick}
              disabled={disabled || readonly}
              uiSchema={uiSchema}
              registry={registry}
            />
          </p>
        </div>
      )}
    </fieldset>
  )
}

// Custom widgets to match old react-jsonschema-form-bs4 output
const CheckboxWidget = (props) => {
  const { id, value, disabled, readonly, label, onChange } = props
  return (
    <div className="checkbox ">
      <div className="form-check">
        <input
          type="checkbox"
          id={id}
          className="form-check-input"
          checked={typeof value === 'undefined' ? false : value}
          disabled={disabled || readonly}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label className="form-check-label" htmlFor="defaultCheck1">
          {label}
        </label>
      </div>
    </div>
  )
}

const TextWidget = (props) => {
  const { id, placeholder, value, disabled, readonly, onChange, label } = props
  return (
    <input
      className="form-control"
      id={id}
      label={label}
      placeholder={placeholder || ''}
      type="text"
      value={value || ''}
      disabled={disabled || readonly}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    />
  )
}

const NumberWidget = (props) => {
  const { id, placeholder, value, disabled, readonly, onChange, label } = props
  return (
    <input
      className="form-control"
      id={id}
      label={label}
      placeholder={placeholder || ''}
      type="number"
      step="any"
      value={value === null || value === undefined ? '' : value}
      disabled={disabled || readonly}
      onChange={(event) => {
        const newValue = event.target.value
        onChange(newValue === '' ? undefined : parseFloat(newValue))
      }}
    />
  )
}

const SelectWidget = (props) => {
  const { id, value, disabled, readonly, onChange, options } = props
  const { enumOptions } = options
  return (
    <select
      id={id}
      className="form-control"
      value={value || ''}
      disabled={disabled || readonly}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    >
      {enumOptions && enumOptions.map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  )
}

// Custom widgets to match old react-jsonschema-form-bs4 output
const customWidgets = {
  CheckboxWidget,
  TextWidget,
  TextareaWidget: TextWidget, // Use same as text for now
  NumberWidget,
  SelectWidget
}

// Custom button templates to match the original styling
const customTemplates = {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  ButtonTemplates: {
    AddButton: (props) => {
      const { onClick, disabled, className } = props
      return (
        <button
          type="button"
          className={`btn btn-info ${className || ''}`}
          onClick={onClick}
          disabled={disabled}
          tabIndex={0}
        >
          <i className="fas fa-plus" />
        </button>
      )
    },
    MoveUpButton: (props) => {
      const { onClick, disabled, className, style } = props
      return (
        <button
          type="button"
          className={`btn btn-outline-dark ${className || ''}`}
          onClick={onClick}
          disabled={disabled}
          tabIndex={-1}
          style={style}
        >
          <i className="fas fa-arrow-up" />
        </button>
      )
    },
    MoveDownButton: (props) => {
      const { onClick, disabled, className, style } = props
      return (
        <button
          type="button"
          className={`btn btn-outline-dark ${className || ''}`}
          onClick={onClick}
          disabled={disabled}
          tabIndex={-1}
          style={style}
        >
          <i className="fas fa-arrow-down" />
        </button>
      )
    },
    RemoveButton: (props) => {
      const { onClick, disabled, className, style } = props
      return (
        <button
          type="button"
          className={`btn btn-danger ${className || ''}`}
          onClick={onClick}
          disabled={disabled}
          tabIndex={-1}
          style={style}
        >
          <i className="fas fa-times" />
        </button>
      )
    },
    SubmitButton: (props) => {
      const { uiSchema } = props
      const { submitText } = uiSchema?.['ui:submitButtonOptions'] || {}
      return (
        <div>
          <button type="submit" className="btn btn-info">
            {submitText || 'Submit'}
          </button>
        </div>
      )
    }
  }
}

// eslint-disable-next-line react/display-name
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
        properties: schema.properties
      }
    }
  }

  if (plugin.statusMessage) {
    topSchema.description = `Status: ${plugin.statusMessage}`
  }

  const { enabled, enableLogging, enableDebug } = plugin.data
  return (
    <Form
      validator={validator}
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      templates={customTemplates}
      widgets={customWidgets}
      onSubmit={(submitData) => {
        onSubmit({
          ...submitData.formData,
          enabled,
          enableLogging,
          enableDebug
        })
      }}
    />
  )
}