import archiver from 'archiver'
import { Response } from 'express'
import fs from 'fs'

interface ZipFile {
  path: string
  name: string
}

interface ZipOptions {
  files: ZipFile[]
  filename: string
}

/**
 * Send a zip file as a download response.
 * Replacement for express-easy-zip using archiver directly.
 */
export function sendZip(res: Response, options: ZipOptions): void {
  const { files, filename } = options

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.zip"`)

  const archive = archiver('zip', {
    zlib: { level: 9 }
  })

  archive.on('error', (err: Error) => {
    console.error('Zip archive error:', err)
    if (!res.headersSent) {
      res.status(500).send('Error creating zip file')
    }
  })

  archive.pipe(res)

  for (const file of files) {
    const stat = fs.statSync(file.path)
    if (stat.isDirectory()) {
      archive.directory(file.path, file.name)
    } else {
      archive.file(file.path, { name: file.name })
    }
  }

  archive.finalize()
}
