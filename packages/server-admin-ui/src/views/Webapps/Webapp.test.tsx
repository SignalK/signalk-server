import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Webapp from './Webapp'

describe('Webapp', () => {
  describe('app icon box', () => {
    it('renders a transparent box with the app icon as background when appIcon is set', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app', signalk: { appIcon: 'icon.png' } }}
        />
      )

      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toBeInTheDocument()
      expect(iconBox.style.backgroundImage).toContain('test-app/icon.png')
      // No background colour, so the icon's transparent regions show the card.
      expect(iconBox).not.toHaveClass('bg-primary')
    })

    it('renders a blue placeholder box with a grid icon when neither appIcon nor displayName is set', () => {
      const { container } = render(<Webapp webAppInfo={{ name: 'test-app' }} />)

      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toHaveClass('bg-primary')
      expect(
        container.querySelector('[data-icon="table-cells"]')
      ).toBeInTheDocument()
    })

    it('renders an empty blue box when displayName is set but appIcon is not', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{
            name: 'test-app',
            signalk: { displayName: 'Test App' }
          }}
        />
      )

      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toHaveClass('bg-primary')
      expect(
        container.querySelector('[data-icon="table-cells"]')
      ).not.toBeInTheDocument()
    })
  })

  describe('launch', () => {
    it('fires onLaunch when the card link is clicked', () => {
      const onLaunch = vi.fn()
      const { container } = render(
        <Webapp webAppInfo={{ name: 'test-app' }} onLaunch={onLaunch} />
      )

      const link = container.querySelector('a') as HTMLAnchorElement
      fireEvent.click(link)

      expect(onLaunch).toHaveBeenCalledTimes(1)
    })
  })
})
