const Slimbot = require('slimbot');
require('dotenv').config();

class Notificator {
	constructor(params = {}) {
	}

	static async initialize() {
		if (this._initialized) {
			return true;
		}

		if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_NOTIFY_USER_ID) {
			return false;
		}

		this._initialized = false;

		try {
			this._slimbot = new Slimbot(process.env.TELEGRAM_BOT_TOKEN);
			const me = await this._slimbot.getMe();

			if (me && me.result && me.result.is_bot) {
				// this._slimbot.startPolling();
			}

			this._initialized = true;
		} catch(e) {
			this._initialized = false;
		}


		return this._initialized;
	}

	static async stop() {
		if (this._slimbot) {
			this._slimbot.stopPolling();
		}
	}

	static async waitForMessage() {
		if (!(await this.initialize() )) return false;

		const promise = new Promise((res)=>{
			this._slimbot.on('message', message => {
				res(message);
			});
		});

		return await promise;
	}

	static async log(message) {
		if (!(await this.initialize() )) return false;

		this._slimbot.sendMessage(process.env.TELEGRAM_NOTIFY_USER_ID, message);
	}

};

module.exports = Notificator;