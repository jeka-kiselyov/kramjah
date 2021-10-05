const EventEmitter = require('events');
const HitBtcAuthedSocket = require('./HitBtcAuthedSocket.js');
const moment = require('moment');

const HitBtcApi = require('./HitBtcApi.js');

class HitBtc extends EventEmitter {
	constructor(params = {}) {
		super(params);

		let tradingUrl = 'wss://api.demo.hitbtc.com/api/3/ws/trading';
		if (params.demo === false) {
			tradingUrl = 'wss://api.hitbtc.com/api/3/ws/trading';
		}

		this._tradingSocket = new HitBtcAuthedSocket({
			demo: params.demo,
			url: tradingUrl,
		});
		this._api = new HitBtcApi({
			demo: params.demo,
		});

		this._initialized = false;
		this._symbols = {

		};
		this._orders = {

		};

		this._tradingSocket.on('authed', ()=>{
			this.afterAuth();
		});
		this._tradingSocket.on('json', (data)=>{
			this.socketData(data);
		});

		this._readyPromiseResolver = null;
		this._readyPromise = new Promise((res)=>{
			this._readyPromiseResolver = res;
		});
	}

	static getSingleton(demo) {
		if (demo === false) {
			if (HitBtc.__instance) {
				return HitBtc.__instance;
			} else {
				HitBtc.__instance = new HitBtc({
					demo: false,
				})
				return HitBtc.__instance;
			}
		} else {
			if (HitBtc.__demoInstance) {
				return HitBtc.__demoInstance;
			} else {
				HitBtc.__demoInstance = new HitBtc({
					demo: true,
				})
				return HitBtc.__demoInstance;
			}
		}
	}

	async waitTillReady() {
		return await this._readyPromise;
	}

	log(...fArgs) {
		fArgs.unshift('HitBTC');

		if (this._logger) {
			this._logger.info.apply(this._logger, fArgs);
		} else {
			console.log.apply(this._logger, fArgs);
		}
	}


	async socketData(data) {
		// console.log('got data', data);
		if (data.method == 'spot_orders') {
			for (let orderFromApi of data.params) {
				this.storeOrderFromApi(orderFromApi);
			}
		} else if (data.method == 'spot_order') {
			this.storeOrderFromApi(data.params);
		}
	}

	async afterAuth() {
		this.log('Subsribing to updates...');
		const resp = await this._tradingSocket.sendRequest({
			method: 'spot_subscribe',
			params: {},
		});

		if (resp === true) {
			await this.reSync();

			this._readyPromiseResolver();

			return true;
		}
		return false;
	}

	async initialize() {
		if (this._initialized) {
			return true;
		}

		const success = await this._tradingSocket.initialize();
		if (!success) {
			throw new Error('Can not initialize trading socket');
		}

		this._initialized = true;

		return true;
	}

	async reSync() {
		const activeOrders = await this.getOrders();
		this.log('Active orders', activeOrders.length);
		const allHistoryOders = await this.getAllHistoryOrders();
		this.log('History orders', allHistoryOders.length);

		for (let order of activeOrders) {
			this.storeOrderFromApi(order);
		}
		for (let order of allHistoryOders) {
			this.storeOrderFromApi(order);
		}

		await this._api.init();
		for (let symbol in this._api._symbols) {
			if (!this._symbols[symbol]) {
				this._symbols[symbol] = {};
			}
		}

		return true;
	}

	storeOrderFromApi(orderFromApi) {
		const clientOrderId = orderFromApi.client_order_id;

		// if (clientOrderId.indexOf('_') == -1) {  // not made by us
		// 	return false;
		// }

		try {
			const symbol = orderFromApi.symbol;
			let clientOrderIdItems = clientOrderId.split('_');

			let originalPrice = null;
			let itemStrategyName = null;

			if (clientOrderIdItems.length == 3) {
				originalPrice = parseFloat(clientOrderIdItems[0], 10);
				itemStrategyName = clientOrderIdItems[1];
			}

			const toPush = { /// transform it to apiv2 style
				originalPrice: originalPrice,
				strategyName: itemStrategyName,
				symbol: symbol,
				clientOrderId: clientOrderId,
				price: orderFromApi.price,
				side: orderFromApi.side,
				type: orderFromApi.type,
				status: orderFromApi.status,
				quantity: orderFromApi.quantity,
				cumQuantity: orderFromApi.quantity_cumulative,
				createdAt: orderFromApi.created_at,
				createdAtDate: new Date(orderFromApi.created_at),
				updatedAt: orderFromApi.updated_at,
				updatedAtDate: new Date(orderFromApi.updated_at),
			};

			if (this._orders[clientOrderId]) {
				// check if updated
				let updated = false;
				if (toPush.status != this._orders[clientOrderId].status) {
					updated = true;
					this._orders[clientOrderId].status = toPush.status;
				}
				if (toPush.cumQuantity != this._orders[clientOrderId].cumQuantity) {
					updated = true;
					this._orders[clientOrderId].cumQuantity = toPush.cumQuantity;
				}
				if (toPush.updatedAt != this._orders[clientOrderId].updatedAt) {
					updated = true;
					this._orders[clientOrderId].updatedAt = toPush.updatedAt;
					this._orders[clientOrderId].updatedAtDate = toPush.updatedAtDate;
				}

				if (updated) {
					this.log('Order updated: '+ clientOrderId);
					this.emit('updated', this._orders[clientOrderId]);
				}

				return;
			}

			if (!this._symbols[symbol]) {
				this._symbols[symbol] = {};
			}

			if (itemStrategyName && originalPrice) {
				/// our orders
				if (!this._symbols[symbol][itemStrategyName]) {
					this._symbols[symbol][itemStrategyName] = {};
				}
				if (!this._symbols[symbol][itemStrategyName][''+originalPrice]) {
					this._symbols[symbol][itemStrategyName][''+originalPrice] = [];
				}

				this._symbols[symbol][itemStrategyName][''+originalPrice].push(toPush);
			} else {
				// all other orders
				// if (!this._symbols[symbol]['undefined']) {
				// 	this._symbols[symbol]['undefined'] = {};
				// }

			}
			this._orders[clientOrderId] = toPush;

			this.log('Order added: '+ clientOrderId);
			// console.log('order added', clientOrderId, this._orders[clientOrderId]);
			this.emit('added', this._orders[clientOrderId]);
		} catch(e) {
			console.error(e);
		}

	}

	async getOrders() {
		await this.initialize();

		const resp = await this._tradingSocket.sendRequest({
			method: 'spot_get_orders',
		});

		return resp;
	}

	async getAllHistoryOrders() {
		const maxThreads = 8;

		let historyOrders = await this._api.getHistoryOrders();

		let currentOffset = 1000;
		let gotLess = false;
		const getNext = (offset) => {
			return new Promise((res)=>{
				this._api.getHistoryOrders({
					offset: offset,
				})
				.then((moreItems)=>{
					// console.log('offset', offset, 'length', moreItems.length);

					historyOrders = historyOrders.concat(moreItems);
					if (moreItems.length < 1000) {
						gotLess = true;
					}

					res();
				});
			});
		};

		while (!gotLess) {
			const promises = [];
			for (let i = 0; i <= maxThreads; i++) {
				const promise = getNext(currentOffset);
				promises.push(promise);
				currentOffset += 1000;
			}

			await Promise.all(promises);
		}

		return historyOrders;
	}

	async getOrderByClientOrderIdWithCache(params) {
		await this.waitTillReady();

		let clientOrderId = params.clientOrderId || null;

		if (this._orders[clientOrderId]) {
			return this._orders[clientOrderId];
		}

		return null;
	}

	normalizeSymbol(symbol) {
		let upperSymbol = (''+symbol).toUpperCase();

		if (this._symbols[upperSymbol]) {
			return upperSymbol;
		} else if (this._symbols[upperSymbol+'T']) { // USD -> USDT in Api V3
			return upperSymbol+'T';
		}
	}

	async getRecentOrdersBySymbolAndStrategyName(params) {
		await this.initialize();
		await this.waitTillReady();

		let outdatedToo = params.outdatedToo;
		let notOursToo = params.notOursToo;

		let symbol = this.normalizeSymbol(params.symbol); // ETHBTC or BTCUSD or others

		const strategyName = params.strategyName || null;

		if (!strategyName || !symbol) {
			throw new Error('Both strategyName and symbol required');
		}

		const importantOrders = [];

		if (this._symbols[symbol][strategyName]) {
			for (let originalPriceKey in this._symbols[symbol][strategyName]) {

			    this._symbols[symbol][strategyName][originalPriceKey].sort(function(a, b) { return b.createdAt - a.createdAt; }); /// sort DESC by createdAt

				const ordersCount = this._symbols[symbol][strategyName][originalPriceKey].length;
				const mostRecentOrder = this._symbols[symbol][strategyName][originalPriceKey][0];

				const previousOrders = this._symbols[symbol][strategyName][originalPriceKey].slice(1);
				mostRecentOrder.previousOrders = previousOrders;

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
		}

	    importantOrders.sort(function(a, b) { return b.originalPrice - a.originalPrice; }); /// sort DESC by originalPrice

		return importantOrders;
	}

	async getAllSymbols() {
		return await this._api.getAllSymbols();
	}

	async getSymbolInfo(symbol) {
		return await this._api.getSymbolInfo(symbol);
	}

    async getLastD1Candle(symbol) {
    	return await this._api.getLastD1Candle(symbol);
    }

	async getM5Candles(symbol, fromTime, toTime) {
		return await this._api.getM5Candles(symbol, fromTime, toTime);
	}

    async getTickers(symbols) {
    	return await this._api.getTickers(symbols);
    }

	async getTicker(symbol) {
    	return await this._api.getTicker(symbol);
    }

	async getTradingBalance() {
		return this.normalizeBalance(await this._api.getTradingBalance());
	}

	async getAccountBalance() {
		return this.normalizeBalance(await this._api.getAccountBalance());
	}

	async transferFromTradingBalance(params) {
		return await this._api.transferFromTradingBalance(params);
	}

	async transferToTradingBalance(params) {
		return await this._api.transferToTradingBalance(params);
	}

	normalizeBalance(balanceApiResponse) {
		const ret = [];
		let hasUSD = false;
		let usdtItem = null;
		for (let balanceItem of balanceApiResponse) {
			const key = balanceItem.currency;
			const item = {
				available: parseFloat(balanceItem.available),
				reserved: parseFloat(balanceItem.reserved),
				currency: balanceItem.currency,
			};
			item.total = item.available + item.reserved;

			ret.push(item);
			if (item.currency == 'USD') {
				hasUSD = true;
			} else if (item.currency == 'USDT') {
				usdtItem = item;
			}

			// ret.push({
			// 	available: parseFloat(balanceItem.available),
			// 	reserved: parseFloat(balanceItem.reserved),
			// 	currency: balanceItem.currency,
			// });

			// ret[key].total = ret[key].available + ret[key].reserved;
		}

		// copy USDT as USD?
		if (!hasUSD && usdtItem) {
			ret.push({
				available: usdtItem.available,
				reserved: usdtItem.reserved,
				total: usdtItem.total,
				currency: 'USD',
			});
		}

		for (let item of ret) {
			ret[item.currency] = item;
		}

		// if (ret['USDT'] && !ret['USD']) {
		// 	ret['USD'] = ret['USDT'];
		// }

		return ret;
	}

	async placeOrder(params) {
		await this.initialize();
		await this.waitTillReady();

		// https://api.hitbtc.com/#create-new-spot-order
		let clientOrderId = params.clientOrderId || null;
		let side = params.side; // buy or sell
		let symbol = this.normalizeSymbol(params.symbol); // ETHBTC or BTCUSD or others

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
			time_in_force: timeInForce,
			quantity: quantity,
			price: price,
			strict_validate: strictValidate,
		};

		if (clientOrderId) {
			orderData.client_order_id = clientOrderId;
		}

		let resp = await this._tradingSocket.sendRequest({
			"method": "spot_new_order",
			"params": orderData,
		});

		if (resp) {
			if (resp.client_order_id) {
				resp.clientOrderId = resp.client_order_id; // support v2 style
			}

			return resp;
		}

		return false;
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
		let clientOrderId = params.clientOrderId || null;

		await this.initialize();
		await this.waitTillReady();

		let resp = await this._tradingSocket.sendRequest({
			"method": "spot_cancel_order",
			"params": {
				"client_order_id": clientOrderId,
			},
		});

		if (resp) {
			return true;
		}

		return false;
	}


	async normalizePrice(price, symbol) {
		return await this._api.normalizePrice(price, symbol);
	}

	async normalizeQuantity(quantity, symbol) {
		return await this._api.normalizeQuantity(quantity, symbol);
	}

	async close() {
		await this._tradingSocket.close();
		await this._api.close();
	}
};

module.exports = HitBtc;