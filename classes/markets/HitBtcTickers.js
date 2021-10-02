const EventEmitter = require('events');
const HitBtcSocket = require('./HitBtcSocket.js');
const moment = require('moment');

class HitBtcTickers extends EventEmitter {
	constructor(params = {}) {
		super(params);

		let baseURL = 'wss://api.demo.hitbtc.com/api/3/ws/public';

		if (params.demo === false) {
			baseURL = 'wss://api.hitbtc.com/api/3/ws/public';
		}

		this._publicSocket = new HitBtcSocket({
			url: baseURL,
		});
		this._publicSocket.on('data', (data)=>{
			this.socketData(data);
		});

		this._tickers = {

		};
		this._tickersSubscriptionsPromises = {};
		this._tickersSubscriptionsPromisesResolvers = {};

		this._timeout = 5000;
	}

	async close() {
		await this._publicSocket.close();
	}

	socketData(data) {
		for (let key in this._tickers) {
			if (data[key]) {

				this._tickers[key] = {
					time: moment(data[key].t).valueOf(),
					low: parseFloat(data[key].l, 10),
					high: parseFloat(data[key].h, 10),
					open: parseFloat(data[key].o, 10),
					close: parseFloat(data[key].c, 10),
					volume: parseFloat(data[key].v, 10),
					price: parseFloat(data[key].c, 10),
				};

				if (this._tickersSubscriptionsPromises[key]) {
					this._tickersSubscriptionsPromisesResolvers[key](this._tickers[key]);

					delete this._tickersSubscriptionsPromises[key];
					delete this._tickersSubscriptionsPromisesResolvers[key];
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
			this._publicSocket.subscribeTo('ticker/1s', { "symbols": [symbol] });

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