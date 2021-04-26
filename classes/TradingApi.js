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
			timeout: 10000,
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

	async getAccountBalance() {
		let url = 'account/balance';
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

	async getRecentOrdersBySymbolAndStrategyName(params) {
		let outdatedToo = params.outdatedToo;
		let notOursToo = params.notOursToo;

		let symbol = params.symbol; // ETHBTC or BTCUSD or others
		symbol = (''+symbol).toUpperCase();

		const strategyName = params.strategyName || null;

		if (!strategyName || !symbol) {
			throw new Error('Both strategyName and symbol required');
		}


		let activeOrders = await this.getActiveOrders({
			symbol: symbol,
		});
		let historyOrders = await this.getHistoryOrders({
			symbol: symbol,
		});

		let lastCount = historyOrders.length;
		let offset = 1000;
		while (lastCount >= 1000) { // if count = limit, ask for more
			const moreItems = await this.getHistoryOrders({
				symbol: symbol,
				offset: offset,
			});

			historyOrders = historyOrders.concat(moreItems);
			lastCount = moreItems.length;
			offset += 1000;
		}

		console.log('activeOrders', activeOrders.length);
		console.log('historyOrders', historyOrders.length);

		let byOriginalPriceGroup = {

		};

		let orderToPriceGroup = (order)=>{
			order.createdAt = new Date(order.createdAt);
			// order.createdAt.setTime(order.createdAt.getTime() + Math.random()*1000)
			let clientOrderId = order.clientOrderId;
			if (order.symbol == symbol) {
				if (clientOrderId.indexOf('_') != -1 || notOursToo) {  // made by us
					let clientOrderIdItems = clientOrderId.split('_');

					let originalPrice = parseFloat(clientOrderIdItems[0], 10);
					let itemStrategyName = clientOrderIdItems[1];

					// we process only orders placed on same trading pair by same strategy name
					if (notOursToo && strategyName != itemStrategyName) {
						order.notOurs = true;
					}

					if (notOursToo || strategyName == itemStrategyName) {
						if (!byOriginalPriceGroup[''+originalPrice]) {
							byOriginalPriceGroup[''+originalPrice] = [];
						}

						order.originalPrice = originalPrice;

						byOriginalPriceGroup[''+originalPrice].push(order);
					} else {
					}
				} else {
					console.log('not us');
					console.log(order);
				}
			}
		}

		for (let order of activeOrders) {
			orderToPriceGroup(order);
		}
		for (let order of historyOrders) {
			orderToPriceGroup(order);
		}

		const importantOrders = [];

		for (let originalPriceKey in byOriginalPriceGroup) {
			let orders = byOriginalPriceGroup[originalPriceKey];
		    orders.sort(function(a, b) { return b.createdAt - a.createdAt; }); /// sort DESC by createdAt

		    let mostRecentOrder = orders[0];

		    mostRecentOrder.previousOrders = orders.slice(1); // all previous orders

		    if (mostRecentOrder.status == 'filled' && mostRecentOrder.side == 'buy') {
		    	// bought while we was offline, but sell order on top of it was not created
		    	importantOrders.push(mostRecentOrder);
		    } else if (mostRecentOrder.status == 'partiallyFilled' || mostRecentOrder.status == 'new') {
		    	// active order, not filled, not cancelled
		    	if (mostRecentOrder.side == 'sell') {
		    		// to sell order
		    	} else {
		    		// to buy order
		    	}
		    	importantOrders.push(mostRecentOrder);
		    } else {
		    	// cancelled probably
		    	if (outdatedToo) {
			    	importantOrders.push(mostRecentOrder);
		    	}
		    }
		}

	    importantOrders.sort(function(a, b) { return b.originalPrice - a.originalPrice; }); /// sort DESC by originalPrice

		return importantOrders;
	}

	async getHistoryOrders(params) {
		// https://api.hitbtc.com/#orders-history
		let symbol = params.symbol; // ETHBTC or BTCUSD or others
		symbol = (''+symbol).toUpperCase();

		let url = 'history/order?limit=1000&symbol='+symbol;

		if (params.offset) {
			url += '&offset='+params.offset;
		}

		try {
			let resp = await this._api.get(url);

			console.log('length: ', resp.data.length);

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