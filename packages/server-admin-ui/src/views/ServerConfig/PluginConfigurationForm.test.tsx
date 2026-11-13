import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginConfigurationForm from './PluginConfigurationForm'

const LIST_DESCRIPTION = 'Description of the list.'

function renderForm(
  properties: Record<string, unknown>,
  uiSchema?: Record<string, unknown>
) {
  return render(
    <PluginConfigurationForm
      plugin={{
        data: { configuration: {} },
        schema: { type: 'object', properties },
        uiSchema
      }}
      onSubmit={vi.fn()}
    />
  )
}

describe('PluginConfigurationForm descriptions', () => {
  it('shows the description of an array field once, below its title', () => {
    const { container } = renderForm({
      items: {
        type: 'array',
        title: 'Items',
        description: LIST_DESCRIPTION,
        items: {
          type: 'object',
          properties: { name: { type: 'string', title: 'Name' } }
        }
      }
    })

    const description = screen.getByText(LIST_DESCRIPTION)
    const fieldset = container.querySelector(
      'fieldset#root_configuration_items'
    )
    expect(description.parentElement).toBe(fieldset)
    expect(description.closest('p p')).toBeNull()
  })

  it('shows the description of an array rendered as a widget once', () => {
    renderForm({
      tags: {
        type: 'array',
        title: 'Tags',
        description: 'Description of the tags.',
        uniqueItems: true,
        items: { type: 'string', enum: ['a', 'b'] }
      }
    })

    expect(screen.getAllByText('Description of the tags.')).toHaveLength(1)
  })

  it('shows the description of other field types once', () => {
    renderForm({
      interval: {
        type: 'number',
        title: 'Interval',
        description: 'Description of a number field.'
      },
      flag: {
        type: 'boolean',
        title: 'Flag',
        description: 'Description of a checkbox.'
      },
      nested: {
        type: 'object',
        title: 'Nested',
        description: 'Description of an object.',
        properties: { name: { type: 'string', title: 'Name' } }
      }
    })

    expect(screen.getAllByText('Description of a number field.')).toHaveLength(
      1
    )
    expect(screen.getAllByText('Description of a checkbox.')).toHaveLength(1)
    expect(screen.getAllByText('Description of an object.')).toHaveLength(1)
  })

  it('keeps Markdown in an array description when the plugin enables it', () => {
    renderForm(
      {
        items: {
          type: 'array',
          title: 'Items',
          description: 'See [the docs](https://example.com).',
          items: { type: 'string' }
        }
      },
      { items: { 'ui:enableMarkdownInDescription': true } }
    )

    const links = screen.getAllByRole('link', { name: 'the docs' })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com')
  })
})
