const bluebird = require('bluebird')
module.exports = bluebird.promisifyAll(require('fs'))

