#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`Removing directory: ${dirPath}`)
    fs.rmSync(dirPath, { recursive: true, force: true })
  } else {
    console.log(`Directory not found (skipping): ${dirPath}`)
  }
}

function removeMapFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found (skipping): ${dirPath}`)
    return
  }

  console.log(`Removing .js.map files from ${dirPath}`)

  function traverseDirectory(dir) {
    const files = fs.readdirSync(dir)

    files.forEach((file) => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        traverseDirectory(filePath)
      } else if (file.endsWith('.js.map')) {
        fs.unlinkSync(filePath)
        console.log(` removed: ${filePath}`)
      }
    })
  }

  traverseDirectory(dirPath)
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    console.log(`Removing ${filePath}`)
    fs.unlinkSync(filePath)
  } else {
    console.log(`Not removing nonexistent but listed file: ${filePath}`)
  }
}

if (process.env.MINIMIZE_DISK_USAGE) {
  console.log('Removing extra files to minimize disk usage')

  removeDirectory('samples/')
  // https://github.com/jfromaniello/selfsigned/issues/73
  removeDirectory('node_modules/@types')

  console.log('Removing .js.map files from specified directories...')
  ;[
    'node_modules/@signalk/server-admin-ui/public/',
    'node_modules/swagger-ui-dist/',
    'node_modules/@signalk/instrumentpanel/public/',
    'node_modules/listr/node_modules/rxjs/bundles/',
    'node_modules/inquirer/node_modules/rxjs/bundles/',
    'node_modules/rxjs/dist/bundles/',
    'node_modules/tar/dist/commonjs/',
    'node_modules/tar/dist/esm/'
  ].forEach(removeMapFiles)

  // Specific files to remove
  const filesToRemove = [
    'node_modules/@mxtommy/kip/public/assets/steelseries-min.js.map'
  ]

  console.log('Removing specific files...')
  filesToRemove.forEach(removeFile)

  console.log('File cleanup completed')
} else {
  console.log('MINIMIZE_DISK_USAGE not set, skipping file cleanup')
}
