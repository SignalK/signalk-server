import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Webapp from './Webapp'

describe('Webapp', () => {
  describe('app icon box', () => {
    it('renders a transparent box with the app icon as background when appIcon is set', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app', signalk: { appIcon: 'icon.png' } }}
        />
      )

      const iconBox = container.querySelector('.font-2xl') as HTMLElement
      expect(iconBox).toBeInTheDocument()
      expect(iconBox.style.backgroundImage).toContain('test-app/icon.png')
      // No background colour, so the icon's transparent regions show the card.
      expect(iconBox).not.toHaveClass('bg-primary')
    })

    it('renders a blue placeholder box with a grid icon when neither appIcon nor displayName is set', () => {
      const { container } = render(<Webapp webAppInfo={{ name: 'test-app' }} />)

      const iconBox = container.querySelector('.font-2xl') as HTMLElement
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

      const iconBox = container.querySelector('.font-2xl') as HTMLElement
      expect(iconBox).toHaveClass('bg-primary')
      expect(
        container.querySelector('[data-icon="table-cells"]')
      ).not.toBeInTheDocument()
    })
  })

  describe('status badges', () => {
    const badgeTexts = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('.badge')).map((b) => b.textContent)

    it('renders no badges when there is no status', () => {
      const { container } = render(<Webapp webAppInfo={{ name: 'test-app' }} />)
      expect(container.querySelectorAll('.badge')).toHaveLength(0)
    })

    it('renders no badges when both counts are zero', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app' }}
          status={{ warnCount: 0, errorCount: 0 }}
        />
      )
      expect(container.querySelectorAll('.badge')).toHaveLength(0)
    })

    it('renders only a warning badge for warn-only status', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app' }}
          status={{ warnCount: 3, errorCount: 0 }}
        />
      )
      expect(badgeTexts(container)).toEqual(['3'])
      expect(container.querySelector('.badge')).toHaveClass('bg-warning')
    })

    it('renders only an error badge for error-only status', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app' }}
          status={{ warnCount: 0, errorCount: 2 }}
        />
      )
      expect(badgeTexts(container)).toEqual(['2'])
      expect(container.querySelector('.badge')).toHaveClass('bg-danger')
    })

    it('renders both badges when there are warnings and errors', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{ name: 'test-app' }}
          status={{ warnCount: 3, errorCount: 2 }}
        />
      )
      expect(container.querySelector('.bg-danger')?.textContent).toEqual('2')
      expect(container.querySelector('.bg-warning')?.textContent).toEqual('3')
    })
  })
})
