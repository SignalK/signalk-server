import React from 'react'
import { withTheme } from '@rjsf/core'
import { Theme as Bootstrap4Theme } from '@rjsf/bootstrap-4'
import validator from '@rjsf/validator-ajv8'
import { getTemplate, getUiOptions } from '@rjsf/utils'

const Form = withTheme(Bootstrap4Theme)

// Constants
const ARRAY_BUTTON_STYLE = {
  flex: '1 1 0%',
  paddingLeft: 6,
  paddingRight: 6,
  fontWeight: 'bold'
}

const GRID_COLUMNS = {
  CONTENT: 'col-9',
  TOOLBAR: 'col-3',
  ADD_BUTTON_CONTAINER: 'col-3 offset-9'
}

const CSS_CLASSES = {
  FORM_CONTROL: 'form-control',
  FORM_CHECK: 'form-check',
  FORM_CHECK_INPUT: 'form-check-input',
  FORM_CHECK_LABEL: 'form-check-label',
  BTN_INFO: 'btn btn-info',
  BTN_OUTLINE_DARK: 'btn btn-outline-dark',
  BTN_DANGER: 'btn btn-danger',
  ARRAY_ITEM: 'row array-item',
  ARRAY_ITEM_TOOLBOX: 'array-item-toolbox',
  ARRAY_ITEM_LIST: 'array-item-list',
  ARRAY_ITEM_ADD: 'row',
  FIELD_DESCRIPTION: 'field-description',
  CHECKBOX: 'checkbox '
}

// Helper functions
const extractTextFromJSX = (node) => {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractTextFromJSX).join('')
  if (node.props?.children) return extractTextFromJSX(node.props.children)
  return ''
}

const getDescriptionText = (rawDescription, schema, description) => {
  let descriptionText = rawDescription || schema.description || description

  // If description is JSX, extract text content
  if (descriptionText && typeof descriptionText === 'object' && descriptionText.props) {
    descriptionText = extractTextFromJSX(descriptionText).trim()
  }

  return descriptionText && String(descriptionText).trim().length > 0
    ? descriptionText
    : ''
}

const isArrayItemId = (id) => {
  if (!id || typeof id !== 'string') return false
  const parts = id.split('_')
  return parts.length > 2 && /^\d+$/.test(parts[parts.length - 1])
}

const createButton = (className, onClick, disabled, style, icon, tabIndex = 0) => (
  <button
    type="button"
    className={className}
    onClick={onClick}
    disabled={disabled}
    tabIndex={tabIndex}
    style={style}
  >
    {icon}
  </button>
)

// Custom Templates
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

  const { MoveUpButton, MoveDownButton, RemoveButton } =
    registry.templates.ButtonTemplates

  return (
    <div className={CSS_CLASSES.ARRAY_ITEM}>
      <div className={GRID_COLUMNS.CONTENT}>{children}</div>
      <div
        className={`${GRID_COLUMNS.TOOLBAR} ${CSS_CLASSES.ARRAY_ITEM_TOOLBOX}`}
      >
        {hasToolbar && (
          <div
            className="btn-group"
            style={{ display: 'flex', justifyContent: 'space-around' }}
          >
            {(hasMoveUp || hasMoveDown) && (
              <MoveUpButton
                className="array-item-move-up"
                style={ARRAY_BUTTON_STYLE}
                disabled={disabled || readonly || !hasMoveUp}
                onClick={onReorderClick(index, index - 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {(hasMoveUp || hasMoveDown) && (
              <MoveDownButton
                className="array-item-move-down"
                style={ARRAY_BUTTON_STYLE}
                disabled={disabled || readonly || !hasMoveDown}
                onClick={onReorderClick(index, index + 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {hasRemove && (
              <RemoveButton
                className="array-item-remove"
                style={ARRAY_BUTTON_STYLE}
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

const FieldTemplate = (props) => {
  const {
    id,
    classNames,
    style,
    label,
    help,
    required,
    description,
    rawDescription,
    errors,
    children,
    displayLabel,
    schema
  } = props

  const isCheckbox = schema.type === 'boolean'
  const isObject = schema.type === 'object'
  const descriptionText = getDescriptionText(rawDescription, schema, description)

  return (
    <div className={classNames} style={style}>
      {displayLabel && label && !isCheckbox && (
        <label htmlFor={id}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {descriptionText && !isObject && (
        <p id={`${id}__description`} className={CSS_CLASSES.FIELD_DESCRIPTION}>
          {descriptionText}
        </p>
      )}
      {children}
      {errors}
      {help}
    </div>
  )
}

const ObjectFieldTemplate = (props) => {
  const { title, description, properties, idSchema } = props
  const isArrayItem = isArrayItemId(idSchema.$id)

  return (
    <fieldset id={idSchema.$id}>
      {title && !isArrayItem && (
        <legend id={`${idSchema.$id}__title`}>{title}</legend>
      )}
      {description && (
        <p
          id={`${idSchema.$id}__description`}
          className={CSS_CLASSES.FIELD_DESCRIPTION}
        >
          {description}
        </p>
      )}
      {properties.map((prop) => prop.content)}
    </fieldset>
  )
}

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
  const ResolvedArrayFieldItemTemplate = getTemplate(
    'ArrayFieldItemTemplate',
    registry,
    uiOptions
  )
  const { ButtonTemplates: { AddButton } } = registry.templates

  return (
    <fieldset
      className="field field-array field-array-of-object"
      id={idSchema.$id}
    >
      {(uiOptions.title || title) && (
        <legend id={`${idSchema.$id}__title`}>
          {uiOptions.title || title}
        </legend>
      )}
      {(uiOptions.description || schema.description) && (
        <div className={CSS_CLASSES.FIELD_DESCRIPTION}>
          {uiOptions.description || schema.description}
        </div>
      )}
      <div className={CSS_CLASSES.ARRAY_ITEM_LIST}>
        {items?.map(({ key, ...itemProps }) => (
          <ResolvedArrayFieldItemTemplate key={key} {...itemProps} />
        ))}
      </div>
      {canAdd && (
        <div className={CSS_CLASSES.ARRAY_ITEM_ADD}>
          <p className={`${GRID_COLUMNS.ADD_BUTTON_CONTAINER} text-right array-item-add`}>
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

// Custom Widgets
const CheckboxWidget = (props) => {
  const { id, value, disabled, readonly, label, onChange } = props
  return (
    <div className={CSS_CLASSES.CHECKBOX}>
      <div className={CSS_CLASSES.FORM_CHECK}>
        <input
          type="checkbox"
          id={id}
          className={CSS_CLASSES.FORM_CHECK_INPUT}
          checked={value || false}
          disabled={disabled || readonly}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label className={CSS_CLASSES.FORM_CHECK_LABEL} htmlFor={id}>
          {label}
        </label>
      </div>
    </div>
  )
}

const TextWidget = (props) => {
  const { id, placeholder, value, disabled, readonly, required, onChange, schema } = props

  const inputType = schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'
  const step = schema.type === 'number' ? 'any' : schema.type === 'integer' ? '1' : undefined
  const displayValue = value ?? ''

  return (
    <input
      className={CSS_CLASSES.FORM_CONTROL}
      id={id}
      placeholder={placeholder || ''}
      type={inputType}
      step={step}
      value={displayValue}
      disabled={disabled || readonly}
      required={required}
      aria-required={required}
      onChange={(event) => {
        const newValue = event.target.value
        if (inputType === 'number') {
          onChange(newValue === '' ? undefined : (schema.type === 'integer' ? parseInt(newValue, 10) : parseFloat(newValue)))
        } else {
          onChange(newValue === '' ? undefined : newValue)
        }
      }}
    />
  )
}

const TextareaWidget = (props) => {
  const { id, placeholder, value, disabled, readonly, required, onChange, options } = props
  const { rows = 5 } = options || {}
  const displayValue = value ?? ''

  return (
    <textarea
      className={CSS_CLASSES.FORM_CONTROL}
      id={id}
      placeholder={placeholder || ''}
      value={displayValue}
      disabled={disabled || readonly}
      required={required}
      aria-required={required}
      rows={rows}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    />
  )
}

const SelectWidget = (props) => {
  const { id, value, disabled, readonly, required, onChange, options, placeholder } = props
  const { enumOptions } = options
  const displayValue = value ?? ''

  return (
    <select
      id={id}
      className={CSS_CLASSES.FORM_CONTROL}
      value={displayValue}
      disabled={disabled || readonly}
      required={required}
      aria-required={required}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    >
      {!value && (
        <option value="" disabled>
          {placeholder || 'Select...'}
        </option>
      )}
      {enumOptions?.map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  )
}

const customWidgets = {
  CheckboxWidget,
  TextWidget,
  TextareaWidget,
  SelectWidget
}

const customTemplates = {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  ButtonTemplates: {
    AddButton: (props) => createButton(
      `${CSS_CLASSES.BTN_INFO} ${props.className || ''}`,
      props.onClick,
      props.disabled,
      undefined,
      <i className="fas fa-plus" />,
      0
    ),
    MoveUpButton: (props) => createButton(
      `${CSS_CLASSES.BTN_OUTLINE_DARK} ${props.className || ''}`,
      props.onClick,
      props.disabled,
      props.style,
      <i className="fas fa-arrow-up" />,
      -1
    ),
    MoveDownButton: (props) => createButton(
      `${CSS_CLASSES.BTN_OUTLINE_DARK} ${props.className || ''}`,
      props.onClick,
      props.disabled,
      props.style,
      <i className="fas fa-arrow-down" />,
      -1
    ),
    RemoveButton: (props) => createButton(
      `${CSS_CLASSES.BTN_DANGER} ${props.className || ''}`,
      props.onClick,
      props.disabled,
      props.style,
      <i className="fas fa-times" />,
      -1
    ),
    SubmitButton: (props) => {
      const { submitText } = props.uiSchema?.['ui:submitButtonOptions'] || {}
      return (
        <div>
          <button type="submit" className={CSS_CLASSES.BTN_INFO}>
            {submitText || 'Submit'}
          </button>
        </div>
      )
    }
  }
}

// Main component
// eslint-disable-next-line react/display-name
export default ({ plugin, onSubmit }) => {
  const { enabled, enableLogging, enableDebug } = plugin.data

  return (
    <Form
      validator={validator}
      schema={{
        type: 'object',
        ...(plugin.statusMessage && { description: `Status: ${plugin.statusMessage}` }),
        properties: {
          configuration: {
            type: 'object',
            title: ' ',
            description: plugin.schema.description,
            properties: plugin.schema.properties
          }
        }
      }}
      uiSchema={plugin.uiSchema ? { configuration: plugin.uiSchema } : {}}
      formData={plugin.data || {}}
      templates={customTemplates}
      widgets={customWidgets}
      onSubmit={({ formData }) => {
        onSubmit({
          ...formData,
          enabled,
          enableLogging,
          enableDebug
        })
      }}
    />
  )
}
