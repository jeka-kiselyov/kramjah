const createDebug = require('debug');

/**
 * debug formatter for price items
 * @param  {[type]} v [description]
 * @return {[type]}   [description]
 */
createDebug.formatters.p = (v) => {
  return ''+(v ? (new Date(v.time)+' '+v.price) : 'null');
}

module.exports = createDebug;