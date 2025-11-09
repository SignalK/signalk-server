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

/**
 * Safely deep clones a schema object using JSON serialization
 * @param {Object} obj - The object to clone
 * @param {string} objectName - Name of the object for error messages
 * @returns {Object|null} Cloned object or null if cloning fails
 */
function safeDeepClone(obj, objectName = 'object') {
  if (!obj) return null
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (error) {
    console.error(`Failed to clone ${objectName}:`, error)
    return null
  }
}

/**
 * Normalizes empty values to undefined for form consistency
 * @param {*} value - The value to normalize
 * @returns {*} Normalized value (undefined if empty string, original value otherwise)
 */
function normalizeEmptyValue(value) {
  return value === '' ? undefined : value
}

/**
 * Converts a string value to the appropriate number type
 * @param {string} value - The string value to convert
 * @param {string} type - The schema type ('integer' or 'number')
 * @returns {number|undefined} Converted number or undefined if empty
 */
function convertToNumber(value, type) {
  if (value === '') return undefined
  return type === 'integer' ? parseInt(value, 10) : parseFloat(value)
}

/**
 * Extracts text content from a JSX element or returns the string as-is
 * @param {*} node - The node to extract text from
 * @returns {string} Extracted text content
 */
function extractTextFromJSX(node) {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractTextFromJSX).join('')
  if (node.props && node.props.children)
    return extractTextFromJSX(node.props.children)
  return ''
}

/**
 * Gets the description text from various possible sources
 * @param {*} rawDescription - Raw description from RJSF v5
 * @param {Object} schema - The schema object
 * @param {*} description - Fallback description prop
 * @returns {string} The description text or empty string
 */
function getDescriptionText(rawDescription, schema, description) {
  let descriptionText = rawDescription || schema.description || description

  // If description is JSX, extract text content
  if (
    descriptionText &&
    typeof descriptionText === 'object' &&
    descriptionText.props
  ) {
    descriptionText = extractTextFromJSX(descriptionText).trim()
  }

  return descriptionText && String(descriptionText).trim().length > 0
    ? descriptionText
    : ''
}

/**
 * Checks if an ID represents an array item in RJSF
 * Uses a more robust check by examining the ID structure
 * @param {string} id - The RJSF-generated ID
 * @returns {boolean} True if this is an array item
 */
function isArrayItemId(id) {
  // RJSF generates IDs like "root_configuration_arrayField_0" for array items
  // We detect array items by checking for underscore-number at the end of a multi-segment path
  // This is more specific than just checking /_\d+$/ which could match legitimate field names
  if (!id || typeof id !== 'string') return false
  const parts = id.split('_')
  return parts.length > 2 && /^\d+$/.test(parts[parts.length - 1])
}

/**
 * Creates a button component with consistent styling
 * @param {string} className - Additional CSS classes
 * @param {Function} onClick - Click handler
 * @param {boolean} disabled - Whether button is disabled
 * @param {Object} style - Additional inline styles
 * @param {React.ReactNode} icon - Icon element to display
 * @param {number} tabIndex - Tab index for accessibility
 * @returns {React.ReactElement} Button component
 */
function createButton(className, onClick, disabled, style, icon, tabIndex = 0) {
  return (
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
}

/**
 * Custom ArrayFieldItemTemplate matching old react-jsonschema-form-bs4 layout
 * Renders individual items in an array field with move up/down/remove buttons
 */
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

/**
 * Custom FieldTemplate matching old react-jsonschema-form-bs4 layout
 * Handles field rendering with labels, descriptions, and error messages
 */
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

  // Get description text using helper function
  const descriptionText = getDescriptionText(
    rawDescription,
    schema,
    description
  )

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

/**
 * Custom ObjectFieldTemplate matching old react-jsonschema-form-bs4 layout
 * Renders object fields with conditional title display based on context
 */
const ObjectFieldTemplate = (props) => {
  const { title, description, properties, idSchema } = props

  // Use helper function to check if this is an array item
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

/**
 * Custom ArrayFieldTemplate matching old react-jsonschema-form-bs4 layout
 * Renders array fields with add button and item list
 */
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
  const {
    ButtonTemplates: { AddButton }
  } = registry.templates

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
        {items &&
          items.map(({ key, ...itemProps }) => (
            <ResolvedArrayFieldItemTemplate key={key} {...itemProps} />
          ))}
      </div>
      {canAdd && (
        <div className={CSS_CLASSES.ARRAY_ITEM_ADD}>
          <p
            className={`${GRID_COLUMNS.ADD_BUTTON_CONTAINER} text-right array-item-add`}
          >
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

/**
 * Custom CheckboxWidget matching old react-jsonschema-form-bs4 output
 * Renders a checkbox input with label
 */
const CheckboxWidget = (props) => {
  const { id, value, disabled, readonly, label, onChange } = props
  return (
    <div className={CSS_CLASSES.CHECKBOX}>
      <div className={CSS_CLASSES.FORM_CHECK}>
        <input
          type="checkbox"
          id={id}
          className={CSS_CLASSES.FORM_CHECK_INPUT}
          checked={typeof value === 'undefined' ? false : value}
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

/**
 * Custom TextWidget matching old react-jsonschema-form-bs4 output
 * Handles text and number inputs with proper type conversion
 */
const TextWidget = (props) => {
  const {
    id,
    placeholder,
    value,
    disabled,
    readonly,
    required,
    onChange,
    schema
  } = props

  // Determine input type based on schema - RJSF v5 uses TextWidget for number fields too
  const inputType =
    schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'
  const step =
    schema.type === 'number'
      ? 'any'
      : schema.type === 'integer'
        ? '1'
        : undefined

  // Standardize empty value handling
  const displayValue = value === null || value === undefined ? '' : value

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
          onChange(convertToNumber(newValue, schema.type))
        } else {
          onChange(normalizeEmptyValue(newValue))
        }
      }}
    />
  )
}

/**
 * Custom TextareaWidget matching old react-jsonschema-form-bs4 output
 * Renders a multi-line text input
 */
const TextareaWidget = (props) => {
  const {
    id,
    placeholder,
    value,
    disabled,
    readonly,
    required,
    onChange,
    options
  } = props
  const { rows = 5 } = options || {}

  // Standardize empty value handling
  const displayValue = value === null || value === undefined ? '' : value

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
      onChange={(event) => onChange(normalizeEmptyValue(event.target.value))}
    />
  )
}

/**
 * Custom SelectWidget matching old react-jsonschema-form-bs4 output
 * Renders a dropdown select input
 */
const SelectWidget = (props) => {
  const {
    id,
    value,
    disabled,
    readonly,
    required,
    onChange,
    options,
    placeholder
  } = props
  const { enumOptions } = options

  // Standardize empty value handling
  const displayValue = value === null || value === undefined ? '' : value

  return (
    <select
      id={id}
      className={CSS_CLASSES.FORM_CONTROL}
      value={displayValue}
      disabled={disabled || readonly}
      required={required}
      aria-required={required}
      onChange={(event) => onChange(normalizeEmptyValue(event.target.value))}
    >
      {!value && (
        <option value="" disabled>
          {placeholder || 'Select...'}
        </option>
      )}
      {enumOptions &&
        enumOptions.map(({ value: optionValue, label }) => (
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
  TextareaWidget,
  SelectWidget
}

/**
 * Button templates for RJSF forms
 * Using helper function to reduce code duplication
 */
const customTemplates = {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  ButtonTemplates: {
    AddButton: (props) => {
      const { onClick, disabled, className } = props
      return createButton(
        `${CSS_CLASSES.BTN_INFO} ${className || ''}`,
        onClick,
        disabled,
        undefined,
        <i className="fas fa-plus" />,
        0
      )
    },
    MoveUpButton: (props) => {
      const { onClick, disabled, className, style } = props
      return createButton(
        `${CSS_CLASSES.BTN_OUTLINE_DARK} ${className || ''}`,
        onClick,
        disabled,
        style,
        <i className="fas fa-arrow-up" />,
        -1
      )
    },
    MoveDownButton: (props) => {
      const { onClick, disabled, className, style } = props
      return createButton(
        `${CSS_CLASSES.BTN_OUTLINE_DARK} ${className || ''}`,
        onClick,
        disabled,
        style,
        <i className="fas fa-arrow-down" />,
        -1
      )
    },
    RemoveButton: (props) => {
      const { onClick, disabled, className, style } = props
      return createButton(
        `${CSS_CLASSES.BTN_DANGER} ${className || ''}`,
        onClick,
        disabled,
        style,
        <i className="fas fa-times" />,
        -1
      )
    },
    SubmitButton: (props) => {
      const { uiSchema } = props
      const { submitText } = uiSchema?.['ui:submitButtonOptions'] || {}
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

/**
 * PluginConfigurationForm Component
 * Renders a JSON Schema form for plugin configuration using RJSF v5
 * @param {Object} props - Component props
 * @param {Object} props.plugin - Plugin data including schema, uiSchema, and current values
 * @param {Function} props.onSubmit - Callback function when form is submitted
 * @returns {React.ReactElement} RJSF form component
 */
// eslint-disable-next-line react/display-name
export default ({ plugin, onSubmit }) => {
  // Safely clone the schema to avoid mutating the original
  const schema = safeDeepClone(plugin.schema, 'plugin schema')

  // Handle case where schema cloning failed
  if (!schema) {
    console.error('Failed to load plugin schema')
    return <div>Error: Unable to load plugin configuration schema</div>
  }

  // Build uiSchema if provided by plugin
  const uiSchema =
    typeof plugin.uiSchema !== 'undefined'
      ? { configuration: safeDeepClone(plugin.uiSchema, 'plugin uiSchema') }
      : {}

  // Create top-level schema wrapper for configuration
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

  // Add status message if available
  if (plugin.statusMessage) {
    topSchema.description = `Status: ${plugin.statusMessage}`
  }

  return (
    <Form
      validator={validator}
      schema={topSchema}
      uiSchema={uiSchema}
      formData={plugin.data || {}}
      templates={customTemplates}
      widgets={customWidgets}
      onSubmit={(submitData) => {
        // Preserve enabled, enableLogging, and enableDebug from original plugin data
        const { enabled, enableLogging, enableDebug } = plugin.data
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
