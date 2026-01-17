import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import {
  getTemplate,
  getUiOptions,
  RJSFSchema,
  UiSchema,
  RegistryFieldsType,
  RegistryWidgetsType
} from '@rjsf/utils'
import { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'

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

const isArrayItemId = (id: string | undefined): boolean => {
  if (!id || typeof id !== 'string') return false
  const parts = id.split('_')
  return parts.length > 2 && /^\d+$/.test(parts[parts.length - 1])
}

interface ButtonProps {
  className?: string
  onClick?: (e: React.MouseEvent) => void
  disabled?: boolean
  style?: React.CSSProperties
  tabIndex?: number
}

const createButton = (
  className: string,
  onClick: ((e: React.MouseEvent) => void) | undefined,
  disabled: boolean | undefined,
  style: React.CSSProperties | undefined,
  icon: ReactNode,
  tabIndex = 0
) => (
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

interface ArrayFieldItemTemplateProps {
  children: ReactNode
  disabled?: boolean
  hasToolbar?: boolean
  hasMoveUp?: boolean
  hasMoveDown?: boolean
  hasRemove?: boolean
  index: number
  onDropIndexClick: (index: number) => (e?: React.MouseEvent) => void
  onReorderClick: (
    index: number,
    newIndex: number
  ) => (e?: React.MouseEvent) => void
  readonly?: boolean
  registry: {
    templates: {
      ButtonTemplates: {
        MoveUpButton: React.ComponentType<
          ButtonProps & { uiSchema?: UiSchema; registry: unknown }
        >
        MoveDownButton: React.ComponentType<
          ButtonProps & { uiSchema?: UiSchema; registry: unknown }
        >
        RemoveButton: React.ComponentType<
          ButtonProps & { uiSchema?: UiSchema; registry: unknown }
        >
      }
    }
    fields: RegistryFieldsType
    widgets: RegistryWidgetsType
  }
  uiSchema?: UiSchema
}

const ArrayFieldItemTemplate = (props: ArrayFieldItemTemplateProps) => {
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
          <div className="btn-group btn-group-flex">
            {(hasMoveUp || hasMoveDown) && (
              <MoveUpButton
                className="array-item-move-up array-button-style"
                disabled={disabled || readonly || !hasMoveUp}
                onClick={onReorderClick(index, index - 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {(hasMoveUp || hasMoveDown) && (
              <MoveDownButton
                className="array-item-move-down array-button-style"
                disabled={disabled || readonly || !hasMoveDown}
                onClick={onReorderClick(index, index + 1)}
                uiSchema={uiSchema}
                registry={registry}
              />
            )}
            {hasRemove && (
              <RemoveButton
                className="array-item-remove array-button-style"
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

interface FieldTemplateProps {
  id: string
  classNames?: string
  style?: React.CSSProperties
  label?: string
  help?: ReactNode
  required?: boolean
  description?: ReactNode
  errors?: ReactNode
  children: ReactNode
  displayLabel?: boolean
  schema: RJSFSchema
}

const FieldTemplate = (props: FieldTemplateProps) => {
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
  const isObject = schema.type === 'object'

  return (
    <div className={classNames} style={style}>
      {displayLabel && label && !isCheckbox && (
        <label htmlFor={id}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {description && !isObject && (
        <p id={`${id}__description`} className={CSS_CLASSES.FIELD_DESCRIPTION}>
          {description}
        </p>
      )}
      {children}
      {errors}
      {help}
    </div>
  )
}

interface ObjectFieldTemplateProps {
  title?: string
  description?: ReactNode
  properties: Array<{ content: ReactNode }>
  idSchema: { $id: string }
}

const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
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

interface ArrayFieldTemplateProps {
  canAdd?: boolean
  disabled?: boolean
  idSchema: { $id: string }
  uiSchema?: UiSchema
  items?: Array<{ key: string; [key: string]: unknown }>
  onAddClick: (e?: React.MouseEvent) => void
  readonly?: boolean
  registry: {
    templates: {
      ButtonTemplates: {
        AddButton: React.ComponentType<
          ButtonProps & { uiSchema?: UiSchema; registry: unknown }
        >
      }
    }
    fields: RegistryFieldsType
    widgets: RegistryWidgetsType
  }
  schema: RJSFSchema
  title?: string
}

const ArrayFieldTemplate = (props: ArrayFieldTemplateProps) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ResolvedArrayFieldItemTemplate = getTemplate<
    'ArrayFieldItemTemplate',
    any,
    RJSFSchema,
    any
  >('ArrayFieldItemTemplate', registry as any, uiOptions)
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
          {(uiOptions.title || title) as string}
        </legend>
      )}
      {(uiOptions.description || schema.description) && (
        <div className={CSS_CLASSES.FIELD_DESCRIPTION}>
          {(uiOptions.description || schema.description) as string}
        </div>
      )}
      <div className={CSS_CLASSES.ARRAY_ITEM_LIST}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {items?.map(({ key, ...restProps }: any) => (
          <ResolvedArrayFieldItemTemplate key={key} {...restProps} />
        ))}
      </div>
      {canAdd && (
        <div className={CSS_CLASSES.ARRAY_ITEM_ADD}>
          <p
            className={`${GRID_COLUMNS.ADD_BUTTON_CONTAINER} text-end array-item-add`}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customTemplates: any = {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldItemTemplate,
  ButtonTemplates: {
    AddButton: (props: ButtonProps) =>
      createButton(
        `${CSS_CLASSES.BTN_INFO} ${props.className || ''}`,
        props.onClick,
        props.disabled,
        undefined,
        <FontAwesomeIcon icon={faPlus} />,
        0
      ),
    MoveUpButton: (props: ButtonProps) =>
      createButton(
        `${CSS_CLASSES.BTN_OUTLINE_DARK} ${props.className || ''}`,
        props.onClick,
        props.disabled,
        undefined,
        <FontAwesomeIcon icon={faArrowUp} />,
        -1
      ),
    MoveDownButton: (props: ButtonProps) =>
      createButton(
        `${CSS_CLASSES.BTN_OUTLINE_DARK} ${props.className || ''}`,
        props.onClick,
        props.disabled,
        undefined,
        <FontAwesomeIcon icon={faArrowDown} />,
        -1
      ),
    RemoveButton: (props: ButtonProps) =>
      createButton(
        `${CSS_CLASSES.BTN_DANGER} ${props.className || ''}`,
        props.onClick,
        props.disabled,
        undefined,
        <FontAwesomeIcon icon={faTimes} />,
        -1
      ),
    SubmitButton: (props: { uiSchema?: UiSchema }) => {
      const { submitText } =
        (props.uiSchema?.['ui:submitButtonOptions'] as {
          submitText?: string
        }) || {}
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

interface PluginData {
  enabled?: boolean
  enableLogging?: boolean
  enableDebug?: boolean
  configuration?: Record<string, unknown>
  [key: string]: unknown
}

interface PluginSchema {
  description?: string
  properties?: Record<string, unknown>
}

interface Plugin {
  data: PluginData
  schema: PluginSchema
  uiSchema?: UiSchema
  statusMessage?: string
}

interface PluginConfigurationFormProps {
  plugin: Plugin
  onSubmit: (data: PluginData) => void
}

export default function PluginConfigurationForm({
  plugin,
  onSubmit
}: PluginConfigurationFormProps) {
  const { enabled, enableLogging, enableDebug } = plugin.data

  // Build the schema object with proper types
  const formSchema: RJSFSchema = {
    type: 'object',
    ...(plugin.statusMessage && {
      description: `Status: ${plugin.statusMessage}`
    }),
    properties: {
      configuration: {
        type: 'object',
        title: ' ',
        description: plugin.schema.description,
        properties: plugin.schema.properties as RJSFSchema['properties']
      }
    }
  }

  return (
    <Form
      validator={validator}
      schema={formSchema}
      uiSchema={plugin.uiSchema ? { configuration: plugin.uiSchema } : {}}
      formData={plugin.data || {}}
      templates={customTemplates}
      onSubmit={({ formData }) => {
        onSubmit({
          ...formData,
          enabled,
          enableLogging,
          enableDebug
        })
      }}
    >
      <button type="submit" className="btn btn-primary">
        <FontAwesomeIcon icon={faFloppyDisk} style={{ marginRight: '8px' }} />
        Save Configuration
      </button>
    </Form>
  )
}
