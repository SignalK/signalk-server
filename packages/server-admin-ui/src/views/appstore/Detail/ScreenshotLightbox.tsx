import React, { useCallback, useEffect } from 'react'

interface ScreenshotLightboxProps {
  screenshots: string[]
  index: number | null
  onClose: () => void
  onIndexChange: (next: number) => void
}

const ScreenshotLightbox: React.FC<ScreenshotLightboxProps> = ({
  screenshots,
  index,
  onClose,
  onIndexChange
}) => {
  const count = screenshots.length
  const isOpen = index !== null && index >= 0 && index < count

  const next = useCallback(() => {
    if (index === null) return
    onIndexChange((index + 1) % count)
  }, [index, count, onIndexChange])

  const prev = useCallback(() => {
    if (index === null) return
    onIndexChange((index - 1 + count) % count)
  }, [index, count, onIndexChange])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handler)
    // Lock body scroll while open so the page behind doesn't shift.
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = original
    }
  }, [isOpen, next, prev, onClose])

  if (!isOpen) return null

  const src = screenshots[index as number]

  return (
    <div
      className="plugin-detail__lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      onClick={onClose}
    >
      <button
        type="button"
        className="plugin-detail__lightbox-close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
      {count > 1 && (
        <button
          type="button"
          className="plugin-detail__lightbox-nav plugin-detail__lightbox-nav--prev"
          aria-label="Previous screenshot"
          onClick={(e) => {
            e.stopPropagation()
            prev()
          }}
        >
          ‹
        </button>
      )}
      <div
        className="plugin-detail__lightbox-body"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={`Screenshot ${(index as number) + 1} of ${count}`}
          className="plugin-detail__lightbox-img"
        />
        {count > 1 && (
          <div className="plugin-detail__lightbox-counter">
            {(index as number) + 1} / {count}
          </div>
        )}
      </div>
      {count > 1 && (
        <button
          type="button"
          className="plugin-detail__lightbox-nav plugin-detail__lightbox-nav--next"
          aria-label="Next screenshot"
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
        >
          ›
        </button>
      )}
    </div>
  )
}

export default ScreenshotLightbox
