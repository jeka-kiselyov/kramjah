const HitBtc = require('./markets/HitBtc.js');

class Market {
	constructor(params = {}) {
	}

	static getSingleton() {
		return HitBtc.getSingleton();
	}

	static setLogger(logger) {
		const instance = this.getSingleton();
		instance.setLogger(logger);
	}

	static async close() {
		return await Market.getSingleton().close();
	}
};

module.exports = Market;