const EventEmitter = require('events');
const HitBtcSocket = require('./HitBtcSocket.js');
const moment = require('moment');
require('dotenv').config();

class HitBtcTickers extends EventEmitter {
	constructor(params = {}) {
		super(params);

		let baseURL = 'wss://api.demo.hitbtc.com/api/3/ws/public';

		if (process.env.HITBTC_MODE == 'market') {
			baseURL = 'wss://api.hitbtc.com/api/3/ws/public';
		}

		if (params.logger) {
			this._logger = params.logger;
		}

		this._publicSocket = new HitBtcSocket({
			url: baseURL,
		});
		this._publicSocket.on('json', (json)=>{
			this.socketData(json);
		});

		this._tickers = {

		};
		this._tickersSubscriptionsPromises = {};
		this._tickersSubscriptionsPromisesResolvers = {};

		this._timeout = 5000;
	}

	setLogger(logger) {
		this._logger = logger;
		if (this._publicSocket) {
			this._publicSocket.setLogger(logger);
		}
	}

	async close() {
		await this._publicSocket.close();
	}

	socketData(json) {

		const pushTicker = (key, update)=>{
			this._tickers[key] = {
				time: moment(update.t).valueOf(),
				low: parseFloat(update.l, 10),
				high: parseFloat(update.h, 10),
				open: parseFloat(update.o, 10),
				close: parseFloat(update.c, 10),
				volume: parseFloat(update.v, 10),
				price: parseFloat(update.c, 10),
			};

			if (this._tickersSubscriptionsPromises[key]) {
				this._tickersSubscriptionsPromisesResolvers[key](this._tickers[key]);

				delete this._tickersSubscriptionsPromises[key];
				delete this._tickersSubscriptionsPromisesResolvers[key];
			}
		};

		if (json && json.snapshot) {
			for (let key in this._tickers) {
				if (json.snapshot[key]) {
					pushTicker(key, json.snapshot[key][0]);
				}
			}
		}

		if (json && json.update) {
			for (let key in this._tickers) {
				if (json.update[key]) {
					pushTicker(key, json.update[key][0]);
				}
			}
		}
	}

	async getTicker(symbol) {
		symbol = (''+symbol).toUpperCase();

		if (this._tickers[symbol]) {
			return this._tickers[symbol];
		} else {
			this._tickers[symbol] = null;

			// waiting for a first ticker to be received
			if (this._tickersSubscriptionsPromises[symbol]) {
				let timeout = null;
				const resp = await Promise.race([
							this._tickersSubscriptionsPromises[symbol],
							new Promise((res)=>{ timeout = setTimeout(res, this._timeout); })
						]);
				clearTimeout(timeout);
				return resp;
			}

			this._tickersSubscriptionsPromises[symbol] = new Promise((res)=>{
					this._tickersSubscriptionsPromisesResolvers[symbol] = res;
				});

			await this._publicSocket.initialize();
			this._publicSocket.subscribeTo('candles/M5', { "symbols": [symbol], "limit": 1 });
			// this._publicSocket.subscribeTo('ticker/3s', { "symbols": [symbol] });

			// waiting for a first ticker to be received
			if (this._tickersSubscriptionsPromises[symbol]) {
				let timeout = null;
				const resp = await Promise.race([
							this._tickersSubscriptionsPromises[symbol],
							new Promise((res)=>{ timeout = setTimeout(res, this._timeout); })
						]);
				clearTimeout(timeout);
				return resp;
			}
		}
	}
};

module.exports = HitBtcTickers;