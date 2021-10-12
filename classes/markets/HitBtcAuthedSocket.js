const HitBtcSocket = require('./HitBtcSocket.js');
require('dotenv').config();

class HitBtcAuthedSocket extends HitBtcSocket {
	constructor(params = {}) {
		super(params);

		this._socketAuthed = false;

		this.on('opened', ()=>{
			this.auth();
		});
	}

	async auth() {
		this.log('Authing...');
		let apiKey = process.env.HITBTC_DEMO_API_KEY;
		let secretKey = process.env.HITBTC_DEMO_SECRET_KEY;

		if (process.env.HITBTC_MODE == 'market') {
			apiKey = process.env.HITBTC_API_KEY;
			secretKey = process.env.HITBTC_SECRET_KEY;
		}

		const resp = await this.sendRequest({
			method: 'login',
			params: {
				type: 'Basic',
				api_key: apiKey,
				secret_key: secretKey,
			},
		});

		if (resp === true) {
			this.log('Authed.');
			this.emit('authed');

			this._socketAuthed = true;

			return true;
		} else {
			this.log('Authentication failure.');
			this.close();
			this.emit('error');

			return false;
		}
	}
};

module.exports = HitBtcAuthedSocket;