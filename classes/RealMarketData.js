const axios = require('axios');
const moment = require('moment');

class RealMarketData {
	constructor(params = {}) {
		this._api = axios.create({
			baseURL: 'https://api.hitbtc.com/api/2/public/',
			timeout: 6000,
			headers: {'X-Custom-Header': 'foobar'}
		});
	}

	async getSymbolInfo(symbol) {
		symbol = (''+symbol).toUpperCase();
		let url = 'symbol/'+symbol+'';

		let resp = null;
		try {
			resp = await this._api.get(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data && resp.data.id == symbol) {
			return resp.data;
		}

		return null;
	}

	async getTicker(symbol) {
		symbol = (''+symbol).toUpperCase();
		let url = 'ticker?symbols='+symbol+'';

		let resp = null;
		try {
			resp = await this._api.get(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data && resp.data[0] && resp.data[0].symbol == symbol) {
			let row = resp.data[0];
			return {
				time: moment(row.timestamp).valueOf(),
				low: parseFloat(row.bid, 10),
				high: parseFloat(row.ask, 10),
				open: parseFloat(row.open, 10),
				close: parseFloat(row.open, 10),
				volume: parseFloat(row.volume, 10),
				price: parseFloat(row.bid, 10),
			}
		}

		return null;
	}

	async getM5Candles(symbol, fromTime, toTime) {
		symbol = (''+symbol).toUpperCase();

		// symbol = BTCUSD
		let fromTimeISO = moment(fromTime).toISOString();
		let toTimeISO = moment(toTime).toISOString();

		let url = 'candles?symbols='+symbol+'&period=m5&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1000';

		console.log(url);

		let resp = await this._api.get(url);

		// console.log(data);

		if (resp && resp.data && resp.data[symbol]) {
			return resp.data[symbol].map((row)=>{
				return {
					time: moment(row.timestamp).valueOf(),
					low: parseFloat(row.min, 10),
					high: parseFloat(row.max, 10),
					open: parseFloat(row.open, 10),
					close: parseFloat(row.close, 10),
					volume: parseFloat(row.volume, 10),
				};
			});
		}

		return [];
	}
};

module.exports = RealMarketData;