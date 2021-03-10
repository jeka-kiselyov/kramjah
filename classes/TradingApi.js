const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

class TradingApi {
	constructor(params = {}) {
		const apiKey = process.env.HITBTC_API_KEY;
		const secretKey = process.env.HITBTC_SECRET_KEY;

		const credentials = Buffer.from(apiKey + ':' + secretKey).toString('base64');
		this._api = axios.create({
			baseURL: 'https://api.hitbtc.com/api/2/',
			timeout: 6000,
			headers: {
				'Authorization': ('Basic ' + credentials)
			}
		});

		// caches for different symbols
		this._recentActiveOrders = {
		};
		this._recentActiveOrdersCachedAt = {
		};
		// time to cache recent active orders response
		this._recentActiveOrdersCachedFor = 5000;
	}

	async transferFromTradingBalance(params) {
		let url = 'account/transfer';

		let currency = params.currency;
		let amount = params.amount;

		let data = {
			type: 'exchangeToBank',
			currency: currency,
			amount: amount,
		};

		// console.log(data);

		try {
			let resp = await this._api.post(url, data);

			// console.log(resp.data);

			if (resp && resp.data && resp.data.id) {
				return true;
			}
		} catch(e) {
			// console.log(e);
		}

		return false;
	}

	async getTradingBalance() {
		let url = 'trading/balance';
		let resp = await this._api.get(url);

		let ret = [];
		for (let item of resp.data) {
			if (item.available != '0' || item.reserved != '0') {
				ret.push(item);
			}
		}

		return ret;
	}

	beSureThereIsCacheFor(symbol) {
		if (!this._recentActiveOrders[symbol]) {
			this._recentActiveOrders[symbol] = [];
		}
		if (!this._recentActiveOrdersCachedAt[symbol]) {
			this._recentActiveOrdersCachedAt[symbol] = null;
		}
	}


	async getOrderByClientOrderIdWithCache(params) {
		let clientOrderId = params.clientOrderId || null;
		let activeOrders = await this.getActiveOrders(params);
		for (let activeOrder of activeOrders) {
			// console.log('found in active orders');
			if (activeOrder.clientOrderId == clientOrderId) {
				return activeOrder;
			}
		}

		return await this.getHistoryOrderByClientOrderId(params);
	}

	async getHistoryOrderByClientOrderId(params) {
		let clientOrderId = params.clientOrderId || null;
		let url = 'history/order/?clientOrderId='+clientOrderId;

		if (!clientOrderId) {
			throw new Error('invalid clientOrderId');
		}

		try {
			let resp = await this._api.get(url);

			for (let item of resp.data) {
				if (item.clientOrderId == clientOrderId) {
					return item;
				}
			}

			return null;
		} catch(e) {
			return null;
		}
	}

	async getOrderByClientOrderId(params) {
		let clientOrderId = params.clientOrderId || null;
		let url = '/order/'+clientOrderId;

		if (!clientOrderId) {
			throw new Error('invalid clientOrderId');
		}

		try {
			let resp = await this._api.get(url);

			return resp.data;
		} catch(e) {
			return null;
		}
	}

	async getHistoryOrders(params) {
		// https://api.hitbtc.com/#orders-history
		let symbol = params.symbol; // ETHBTC or BTCUSD or others
		symbol = (''+symbol).toUpperCase();

		let url = 'history/order?symbol='+symbol;

		try {
			let resp = await this._api.get(url);

			return resp.data;
		} catch(e) {
			// console.error(e);
			return [];
		}
	}

	async getActiveOrders(params) {
		// https://api.hitbtc.com/#get-active-orders
		let symbol = params.symbol; // ETHBTC or BTCUSD or others
		symbol = (''+symbol).toUpperCase();
		let url = 'order?symbol'+symbol;

		this.beSureThereIsCacheFor(symbol);
		let curDate = new Date();

		if (this._recentActiveOrdersCachedAt[symbol] && Math.abs(this._recentActiveOrdersCachedAt[symbol].getTime() - curDate.getTime()) < this._recentActiveOrdersCachedFor) {

			// console.log('get cached active orders');
			return this._recentActiveOrders[symbol];
		}

		try {
			let resp = await this._api.get(url);

			this._recentActiveOrders[symbol] = resp.data;
			this._recentActiveOrdersCachedAt[symbol] = new Date();

			return resp.data;
		} catch(e) {
			return [];
		}
	}

	async placeOrder(params) {
		// https://api.hitbtc.com/#create-new-order
		let url = 'order';


		let clientOrderId = params.clientOrderId || null;
		let side = params.side; // buy or sell
		let symbol = params.symbol; // ETHBTC or BTCUSD or others
		symbol = (''+symbol).toUpperCase();

		let type = params.type || 'limit'; // Accepted values: limit, market, stopLimit, stopMarket
		let timeInForce = params.timeInForce || 'GTC'; // Accepted values: GTC, IOC, FOK, Day, GTD

		let strictValidate = false; // Price and quantity will be checked for incrementation within the symbol’s tick size and quantity step.. See the symbol's tickSize and quantityIncrement.

		let quantity = params.quantity;
		let price = params.price;

		if (quantity <= 0) {
			throw new Error('Invalid quantity');
		}

		if (price <= 0) {
			throw new Error('Invalid price');
		}

		let orderData = {
			type: type,
			symbol: symbol,
			side: side,
			timeInForce: timeInForce,
			quantity: quantity,
			price: price,
			strictValidate: strictValidate,
		};

		if (clientOrderId) {
			orderData.clientOrderId = clientOrderId;
		}

		let resp = await this._api.post(url, orderData);

// returns
// { id: 438502551602,
//   clientOrderId: '1cb1ccae83784e8633515a83c34ff6fb',
//   symbol: 'BTCUSD',
//   side: 'buy',
//   status: 'new',
//   type: 'limit',
//   timeInForce: 'GTC',
//   price: '45113.50',
//   quantity: '0.00010',
//   postOnly: false,
//   cumQuantity: '0',
//   createdAt: '2021-02-27T20:16:42.1Z',
//   updatedAt: '2021-02-27T20:16:42.1Z' }


		return resp.data;
	}

	async placeBuyOrder(params) {
		try {
			params.side = 'buy';
			return await this.placeOrder(params);
		} catch(e) {
			console.error(e);

			return null;
		}
	}

	async placeSellOrder(params) {
		try {
			params.side = 'sell';
			return await this.placeOrder(params);
		} catch(e) {
			console.error(e);

			return null;
		}
	}

	async cancelOrder(params) {
		// https://api.hitbtc.com/#cancel-order-by-clientorderid
		let clientOrderId = params.clientOrderId || null;
		let url = 'order/'+clientOrderId;

		try {
			let resp = await this._api.delete(url);

			if (resp && resp.data) {
				return true;
			}
		} catch(e) {
			return false;
		}
	}
};

module.exports = TradingApi;