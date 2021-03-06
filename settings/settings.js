if (typeof __webpack_require__ === 'function') {
	throw new Error("You'd better not include this little piece for frontend scripts, honey");
}

const path = require('path');
const pjson = require(path.join(__dirname, '../package.json'));

module.exports = {
	"name": pjson.description || pjson.name,
	"version": pjson.version,
	"debug": true,
	"paths": {
		"commands": path.join(__dirname, "../commands"),
		"models": path.join(__dirname, "../models"),
	}
};