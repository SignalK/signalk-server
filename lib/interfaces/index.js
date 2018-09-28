require('fs')
  .readdirSync(require('path').join(__dirname, '/'))
  .forEach(function(file) {
    if (file.match(/.+\.js$/g) !== null && file !== 'index.js') {
      const name = file.replace('.js', '')
      exports[name] = require('./' + file)
    }
  })
