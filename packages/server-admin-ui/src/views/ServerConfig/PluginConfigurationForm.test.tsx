import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginConfigurationForm from './PluginConfigurationForm'

describe('PluginConfigurationForm', () => {
  it.each(['Running', 'Connection failed'])(
    'does not display the plugin list status "%s"',
    (statusMessage) => {
      const plugin = {
        statusMessage,
        data: { configuration: { host: 'localhost' } },
        schema: {
          description: 'Configure the plugin connection.',
          properties: {
            host: {
              type: 'string',
              title: 'Host',
              description: 'Hostname of the data source.'
            }
          }
        }
      }

      render(<PluginConfigurationForm plugin={plugin} onSubmit={vi.fn()} />)

      expect(screen.queryByText(`Status: ${statusMessage}`)).toBeNull()
      expect(
        screen.getByText('Configure the plugin connection.')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Hostname of the data source.')
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Host')).toHaveValue('localhost')
      expect(
        screen.getByRole('button', { name: 'Save Configuration' })
      ).toBeInTheDocument()
    }
  )
})
