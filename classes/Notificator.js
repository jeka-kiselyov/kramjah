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

	static async onMessage(func) {
		if (!(await this.initialize() )) return false;

		if (this._onMessageHandlerAdded) {
			throw new Error('Adding another onMessage handler is not supported');
		}

		this._slimbot.startPolling();
		this._slimbot.on('message', message => {
			func(message);
		});
		this._onMessageHandlerAdded = true;

		return true;
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

	static async logAccountBalance(tradingApi) {
		let text = '';

        const mainBalance = await tradingApi.getAccountBalance();
        const tradingBalance = await tradingApi.getTradingBalance();
        for (let mainBalanceItem of mainBalance) {
	        for (let tradingBalanceItem of tradingBalance) {
	        	if (mainBalanceItem.currency == tradingBalanceItem.currency) {
	        		if (mainBalanceItem.available || tradingBalanceItem.available || tradingBalanceItem.reserved) {
		                text += ''+mainBalanceItem.currency+' Main Account: '+mainBalanceItem.available+' Avail: '+tradingBalanceItem.available+' Reserved: '+tradingBalanceItem.reserved+"\n\n";
	        		}
	        	}
	        }
        }

        await this.log(text);
	}

};

module.exports = Notificator;