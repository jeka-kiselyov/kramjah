const jspack = require('./jspack.js');

class Pack {
	static pack(format, values) {
		return jspack.Pack(format, values);
	}

	static unpack(format, buffer) {
		return jspack.Unpack(format, buffer, 0);
	}
}


module.exports = Pack;