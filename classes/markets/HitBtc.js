const WebSocket = require('ws');
const moment = require('moment');
const axios = require('axios');
require('dotenv').config();

const EventEmitter = require('events');

class HitBTC extends EventEmitter {
	constructor(params = {}) {
		super();

		this._logger = params.logger || null;

		this._timeout = 10000;

		this.flushProperties();
		this.flushData();
	}

	flushProperties() {
		this._lastCommandId = 0;
		this._ws = null;
		this._mostRecentMessageReceivedDate = null;

		this._initializationPromise = null;
		this._initializationPromiseResolver = null;

		this._commandsAwaitors = {};

		this._tickersSubscriptions = {};

		this._tickersSubscriptionsPromises = {};
		this._tickersSubscriptionsPromisesResolvers = {};

		this._wsAuthPromise = null;
		this._wsAuthPromiseResolver = null;

		this._ordersSubscribed = false;
		this._ordersSubscriptionsPromise = null;
		this._ordersSubscriptionsPromiseResolver = null;
	}

	flushData() {
		this._tickers = {};
		this._orders = {};
	}

	log(...fArgs) {
		if (this._logger) {
			this._logger.info.apply(this._logger, fArgs);
		}
	}

	heartBeat() {
		clearTimeout(this._pingTimeout);

  // Use `WebSocket#terminate()`, which immediately destroys the connection,
  // instead of `WebSocket#close()`, which waits for the close timer.
  // Delay should be equal to the interval at which your server
  // sends out pings plus a conservative assumption of the latency.
		this._pingTimeout = setTimeout(() => {
			this.reconnect();
		}, 30000 + 1000);

	}

	async reconnect() {
		if (this._ws) {
			this._ws.terminate();
		}
		this.log('Reconnecting to websocket...');

		let needToResubscribeToOrders = false;
		if (this._ordersSubscriptionsPromise) {
			needToResubscribeToOrders = true;
		}

		this.flushProperties();
		const success = await this.initialize();

		if (needToResubscribeToOrders) {
			if (success) {
				this.log('Re-subscribing for orders updates');
				await this.authWS();
				await this.subscribeOrders();
			} else {
				this._ordersSubscriptionsPromise = Promise.resolve(true); // as _ordersSubscriptionsPromise was nulled with flushProperties()
			}
		}
	}

	async initialize() {
		if (this._initializationPromise) {
			return await this._initializationPromise;
		}

		this.log('Initializing WebSocket connection...');
		this.flushProperties();
		this.heartBeat(); // try to reconnect if no luck here

		this._initializationPromise = new Promise((res)=>{
			this._initializationPromiseResolver = res;
		});

		this._api = axios.create({
			baseURL: 'https://api.hitbtc.com/api/2/public/',
			timeout: this._timeout,
			headers: {'X-Custom-Header': 'kramjah'}
		});
		this._ws = new WebSocket('wss://api.hitbtc.com/api/2/ws', {
			perMessageDeflate: false,
		});

		let success = false;

		this._ws.on('message', (data)=>{
			this._mostRecentMessageReceivedDate = new Date();
			this.heartBeat();

			let json = {};
			try {
				json = JSON.parse(data);
			} catch(e) {

			}
			if (json.id && this._commandsAwaitors[json.id]) {
				this._commandsAwaitors[json.id].promiseResolver(json.result);
			} else {
				this.processNotification(json);
			}
		});

		this._ws.on('ping', ()=>{
				this._mostRecentMessageReceivedDate = new Date();
				this.heartBeat();
				this.log('got ping');
			});

		// await for initializtion
		await new Promise((res)=>{
			this._ws.on('open', ()=>{
					success = true;
					res();
				});
			this._ws.on('error', ()=>{
					success = false;
					res();
				});
		});

		this.log('WebSocket connection initialized', success);

		this._initializationPromiseResolver(success);

		return success;
	}

	async authWS() {
		if (this._wsAuthPromise) {
			return await this._wsAuthPromise;
		}
		this._wsAuthPromise = new Promise((res)=>{
			this._wsAuthPromiseResolver = res;
		});

		this.log('WebSocket auth start...');

		const apiKey = process.env.HITBTC_API_KEY;
		const secretKey = process.env.HITBTC_SECRET_KEY;

		const success = await this.sendRequest('login', {
				algo: "BASIC",
				pKey: apiKey,
			    sKey: secretKey,
			});

		this.log('WebSocket auth completed', success);

		this._wsAuthPromiseResolver(success);
		return success;
	}

	async subscribeOrders() {
		if (this._ordersSubscribed) {
			return true;
		}
		if (this._ordersSubscriptionsPromise) {
			return await this._ordersSubscriptionsPromise;
		}

		// promise for a first received ticker
		this._ordersSubscriptionsPromise = new Promise((res)=>{
				this._ordersSubscriptionsPromiseResolver = res;
			});


		// subscribing for events
		await this.sendRequest('subscribeReports');

		// waiting for orders to be received
		if (this._ordersSubscriptionsPromise) {
			await this._ordersSubscriptionsPromise;
		}

		this._ordersSubscribed = true;
	}

	async getOrderByClientOrderId(symbol, clientOrderId) {
		await this.initialize();
		await this.authWS();
		await this.subscribeOrders();

		console.log(this._orders);
	}

	getActiveOrders(symbol) {
		symbol = (''+symbol).toUpperCase();
		if (!this._orders[symbol]) {
			return [];
		}
		return Object.values(this._orders[symbol]);
	}

	async processNotification(json) {
		if (json && json.method) {
			if (json.method == 'ticker' && json.params && json.params.symbol) {
				// ticker subscription
				//
				if (this._tickers[json.params.symbol]) {
					this._tickers[json.params.symbol] = json.params;

					// this.log('Got ticker', json.params.symbol);

					// resolving first received ticker if there's
					if (this._tickersSubscriptionsPromises[json.params.symbol]) {
						this._tickersSubscriptionsPromisesResolvers[json.params.symbol]();

						delete this._tickersSubscriptionsPromises[json.params.symbol];
						delete this._tickersSubscriptionsPromisesResolvers[json.params.symbol];
					}
				}
			}
			if (json.method == 'activeOrders' && json.params && json.params.length) {
				// activeOrders
				//
				for (let order of json.params) {
					const symbol = order.symbol;
					const clientOrderId = order.clientOrderId;

					if (!this._orders[symbol]) {
						this._orders[symbol] = {};
					}

					this._orders[symbol][clientOrderId] = order;
				}

				if (this._ordersSubscriptionsPromise) {
					this._ordersSubscriptionsPromiseResolver();
				}
			}
			if (json.method == 'report' && json.params && json.params.clientOrderId) {
				// updated order
				const order = json.params;
				const symbol = order.symbol;
				const clientOrderId = order.clientOrderId;

				if (!this._orders[symbol]) {
					this._orders[symbol] = {};
				}

				this._orders[symbol][clientOrderId] = order;

				this.emit('updated', order);
			}
		}
	}

	async sendRequest(method, params = {}) {
		await this.initialize();

		this._lastCommandId++;
		const commandId = this._lastCommandId;
		const id = 'command_'+this._lastCommandId;

		const data = {
			method: method,
			params: params,
			id: id,
		};

		let promiseResolver = null;
		let promise = new Promise((res)=>{ promiseResolver = res; });
		this._commandsAwaitors[id] = {
			promise: promise,
			promiseResolver: promiseResolver,
		};


		// console.log('command ', method, 'prepared');

		await Promise.race([
					this._ws.send(JSON.stringify(data)),
					new Promise((res)=>{ setTimeout(res, this._timeout); })
				]);


		// console.log('command ', method, 'sent');

		const results = await Promise.race([
					promise,
					new Promise((res)=>{ setTimeout(res, this._timeout); })
				]);

		delete this._commandsAwaitors[id]; // free some memory

		return results;
	}

	async subscribeToTicker(symbol) {
		symbol = (''+symbol).toUpperCase();

		if (this._tickersSubscriptions[symbol]) {
			return true;
		}

		// promise for a first received ticker
		this._tickersSubscriptionsPromises[symbol] = new Promise((res)=>{
				this._tickersSubscriptionsPromisesResolvers[symbol] = res;
			});

		// cleaning up
		if (!this._tickers[symbol]) {
			this._tickers[symbol] = {};
		}
		this._tickersSubscriptions[symbol] = true;

		// subscribing for events
		await this.sendRequest('subscribeTicker', {symbol: symbol});

		// waiting for a first ticker to be received
		if (this._tickersSubscriptionsPromises[symbol]) {
			await this._tickersSubscriptionsPromises[symbol];
		}
	}

	async unsubscribeFromTicker(symbol) {
		symbol = (''+symbol).toUpperCase();
		this._tickersSubscriptions[symbol] = false;
		await this.sendRequest('unsubscribeTicker', {symbol: symbol});
		delete this._tickers[symbol];
	}

	async publicGetAllSymbols() {
		return await this.sendRequest('getSymbols', {});
	}

	async publicGetSymbolInfo(symbol) {
		symbol = (''+symbol).toUpperCase();
		return await this.sendRequest('getSymbol', {symbol: symbol});
	}

	async publicGetTicker(symbol) {
		symbol = (''+symbol).toUpperCase();
		await this.subscribeToTicker(symbol);


		return {
			time: moment(this._tickers[symbol].timestamp).valueOf(),
			low: parseFloat(this._tickers[symbol].bid, 10),
			high: parseFloat(this._tickers[symbol].ask, 10),
			open: parseFloat(this._tickers[symbol].open, 10),
			close: parseFloat(this._tickers[symbol].open, 10),
			volume: parseFloat(this._tickers[symbol].volume, 10),
			price: parseFloat(this._tickers[symbol].bid, 10),
		}
	}

    async publicGetLastD1Candle(symbol) {
        symbol = (''+symbol).toUpperCase();

        let fromTimeISO = moment().subtract(1, 'day').startOf('day').toISOString();
        let toTimeISO = moment().endOf('day').toISOString();

        let url = 'candles?symbols='+symbol+'&period=d1&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1';

        let resp = await this._api.get(url);

        try {

            if (resp && resp.data && resp.data[symbol]) {
                return resp.data[symbol].map((row)=>{
                    return {
                        time: moment(row.timestamp).valueOf(),
                        low: parseFloat(row.min, 10),
                        high: parseFloat(row.max, 10),
                        open: parseFloat(row.open, 10),
                        close: parseFloat(row.close, 10),
                        volume: parseFloat(row.volume, 10),
                        volumeQuote: parseFloat(row.volumeQuote, 10),
                    };
                })[0];
            }

        } catch(e) {}

        return {};
    }

	async publicGetM5Candles(symbol, fromTime, toTime) {
		symbol = (''+symbol).toUpperCase();

		// symbol = BTCUSD
		let fromTimeISO = moment(fromTime).toISOString();
		let toTimeISO = moment(toTime).toISOString();

		let url = 'candles?symbols='+symbol+'&period=m5&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1000';

		// console.log(url);

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
					volumeQuote: parseFloat(row.volumeQuote, 10),
				};
			});
		}

		return [];
	}

};

module.exports = HitBTC;