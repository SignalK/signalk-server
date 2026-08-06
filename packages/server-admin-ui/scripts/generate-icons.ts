// Rasterises the Signal K logo into the favicon / home screen icon set that
// index.html and manifest.webmanifest reference. Run `npm run generate:icon`
// after changing the source SVG; the results are committed, so the icons are
// not regenerated as part of a normal build.
//
// sharp and png-to-ico are not project dependencies — sharp alone is ~20MB of
// platform binaries that no build or test needs. `npm run generate:icon`
// installs them into scripts/node_modules first; delete that directory when
// done.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const IMG_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public_src',
  'img'
)
const SOURCE = path.join(IMG_DIR, 'signal-k-logo-image.svg')

// The logo is drawn without a background and has to stay legible against the
// dark and light home screens both iOS and Android allow.
const BACKGROUND = '#ffffff'

// Fraction of each edge kept clear so the logo does not touch the rounded
// corners platforms crop icons with. Favicons are too small to lose the pixels
// and are never cropped, so they render full bleed.
const MARGIN = 0.1

// Render the vector larger than needed and let sharp downsample, which
// antialiases far better than librsvg does at icon sizes.
const SUPERSAMPLE = 4

// The DPI an SVG user unit is defined against, and the unit sharp's `density`
// is expressed in.
const SVG_DPI = 72

// Opaque RGB, no alpha channel: home screen icons are expected to be fully
// opaque.
const RGB_CHANNELS = 3

const FAVICON_SIZES = [16, 32, 48]

interface PngIcon {
  file: string
  size: number
  margin: number
}

const PNG_ICONS: PngIcon[] = [
  { file: 'favicon-16x16.png', size: 16, margin: 0 },
  { file: 'favicon-32x32.png', size: 32, margin: 0 },
  { file: 'apple-touch-icon.png', size: 180, margin: MARGIN },
  { file: 'icon-192.png', size: 192, margin: MARGIN },
  { file: 'icon-512.png', size: 512, margin: MARGIN }
]

interface ViewBox {
  width: number
  height: number
}

function readViewBox(svg: string): ViewBox {
  const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg)
  if (!viewBox) {
    throw new Error(`${SOURCE} has no viewBox, cannot determine aspect ratio`)
  }
  const [, , width, height] = viewBox[1].trim().split(/\s+/).map(Number)
  return { width, height }
}

async function renderIcon(
  svg: Buffer,
  viewBox: ViewBox,
  size: number,
  margin: number
): Promise<Buffer> {
  const box = size * (1 - 2 * margin)
  const scale = Math.min(box / viewBox.width, box / viewBox.height)
  const width = Math.round(viewBox.width * scale)
  const height = Math.round(viewBox.height * scale)

  const logo = await sharp(svg, {
    density: (SVG_DPI * SUPERSAMPLE * width) / viewBox.width
  })
    .resize(width, height)
    .png()
    .toBuffer()

  // removeAlpha because compositing the transparent logo leaves an all-255
  // alpha channel behind even though the canvas itself has none.
  return sharp({
    create: {
      width: size,
      height: size,
      channels: RGB_CHANNELS,
      background: BACKGROUND
    }
  })
    .composite([{ input: logo, gravity: 'center' }])
    .removeAlpha()
    .png()
    .toBuffer()
}

const svg = await readFile(SOURCE)
const viewBox = readViewBox(svg.toString())

for (const { file, size, margin } of PNG_ICONS) {
  await writeFile(
    path.join(IMG_DIR, file),
    await renderIcon(svg, viewBox, size, margin)
  )
  console.log(`${file} (${size}x${size})`)
}

const favicon = await pngToIco(
  await Promise.all(
    FAVICON_SIZES.map((size) => renderIcon(svg, viewBox, size, 0))
  )
)
await writeFile(path.join(IMG_DIR, 'favicon.ico'), favicon)
console.log(`favicon.ico (${FAVICON_SIZES.join(', ')})`)
