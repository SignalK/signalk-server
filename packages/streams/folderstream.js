const Transform = require('stream').Transform
const fs = require('fs')

function FolderStreamProvider(folder) {
  Transform.call(this, {
    objectMode: false
  })
  this.folder = folder
  this.fileIndex = 0
}

require('util').inherits(FolderStreamProvider, Transform)

FolderStreamProvider.prototype.pipe = function (pipeTo) {
  const files = fs.readdirSync(this.folder)
  pipeNextFile.bind(this)()

  function pipeNextFile() {
    const fileStream = fs.createReadStream(
      this.folder + '/' + files[this.fileIndex]
    )
    fileStream.pipe(pipeTo, { end: false })
    fileStream.on('end', () => {
      this.fileIndex++
      if (this.fileIndex === files.length) {
        pipeTo.end()
      } else {
        pipeNextFile.bind(this)()
      }
    })
  }

  return pipeTo
}

module.exports = FolderStreamProvider
