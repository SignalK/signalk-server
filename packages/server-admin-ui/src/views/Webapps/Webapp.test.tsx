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

    it('renders a blue placeholder box with a monogram of the package name when appIcon is not set', () => {
      const { container } = render(<Webapp webAppInfo={{ name: 'test-app' }} />)

      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toHaveClass('bg-primary')
      expect(iconBox).toHaveTextContent('TA')
    })

    it('sizes the placeholder to match a real icon', () => {
      // Cards sit in a row, so a monogram tile and an icon tile have to be
      // the same square or the row loses its alignment.
      const renderIconBox = (appIcon?: string) =>
        render(
          <Webapp webAppInfo={{ name: 'test-app', signalk: { appIcon } }} />
        ).container.querySelector('.float-start') as HTMLElement

      const withIcon = renderIconBox('icon.png')
      const placeholder = renderIconBox()

      expect(placeholder.style.width).toBe(withIcon.style.width)
      expect(placeholder.style.height).toBe(withIcon.style.height)
      expect(placeholder.style.width).not.toBe('')
    })

    it('takes the monogram from displayName, ignoring punctuation', () => {
      const { container } = render(
        <Webapp
          webAppInfo={{
            name: 'voice-wyoming',
            signalk: { displayName: 'Voice (Wyoming)' }
          }}
        />
      )

      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toHaveClass('bg-primary')
      expect(iconBox).toHaveTextContent('VW')
    })

    it('hides the icon box from the accessibility tree', () => {
      const { container } = render(<Webapp webAppInfo={{ name: 'test-app' }} />)

      // The monogram is decorative: the card already names the app in its
      // header, so announcing "TA" ahead of it is noise.
      const iconBox = container.querySelector('.float-start') as HTMLElement
      expect(iconBox).toHaveAttribute('aria-hidden', 'true')
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
