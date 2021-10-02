const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

const HitBtcTickers = require('./HitBtcTickers.js');

class HitBtcApi {
	constructor(params = {}) {
		let apiKey = process.env.HITBTC_DEMO_API_KEY;
		let secretKey = process.env.HITBTC_DEMO_SECRET_KEY;
		let baseURL = 'https://api.demo.hitbtc.com/api/3';

		if (params.demo === false) {
			apiKey = process.env.HITBTC_API_KEY;
			secretKey = process.env.HITBTC_SECRET_KEY;
			baseURL = 'https://api.hitbtc.com/api/3/';
		}

		const credentials = Buffer.from(apiKey + ':' + secretKey).toString('base64');
		this._api = axios.create({
			baseURL: baseURL,
			timeout: 10000,
			headers: {
				'Authorization': ('Basic ' + credentials)
			}
		});

		this._initializationPromiseResolver = null;
		this._initializationPromise = null;

		this._symbols = {};
		this._currencies = {};

        this._hitBtcTickers = new HitBtcTickers({
        	demo: params.demo,
        });
	}

	log(...fArgs) {
		fArgs.unshift('API');
		if (this._logger) {
			this._logger.info.apply(this._logger, fArgs);
		} else {
			console.log.apply(this._logger, fArgs);
		}
	}

	async apiGet(path) {
		this.log('Querying...', path);

		let resp = null;
		try {
			resp = await this._api.get(path);
		} catch(e) {
			resp = null;
		}

		this.log('Got response', path);
		return resp;
	}


	async apiPost(path, data) {
		this.log('Posting...', path, data);

		let resp = null;
		try {
			const config = {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json',
				}
			};

			const form = new URLSearchParams();
			for (let key in data) {
				form.set(key, data[key]);
			}
			resp = await this._api.post(path, form, config);
		} catch(e) {
			this.log('Got error', (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '');

			return null;
		}

		this.log('Got response', path);
		return resp;
	}

	async close() {
		await this._hitBtcTickers.close();
	}

	async init() {
		if (this._initializationPromise) {
			return await this._initializationPromise;
		}

		this.log('Initialization...');

		this._initializationPromiseResolver = null;
		this._initializationPromise = new Promise((res)=>{
			this._initializationPromiseResolver = res;
		});

		const allSymbols = await this.getAllSymbols();
		// console.log(allSymbols);
		let symbolsCount = 0;
		for (let symbol of allSymbols) {
			this._symbols[symbol.id] = symbol;
			if (!this._currencies[symbol.baseCurrency]) {
				this._currencies[symbol.baseCurrency] = true;
			}
			if (!this._currencies[symbol.quoteCurrency]) {
				this._currencies[symbol.quoteCurrency] = true;
			}
			symbolsCount++;
		}

		this.log('Got symbols information', symbolsCount);

		this._initializationPromiseResolver();
	}

	async normalizePrice(price, symbol) {
		await this.init();
		symbol = this.normalizeSymbol(symbol);

		let tickSize = 0.000000001;
		if (this._symbols[symbol]) {
			tickSize = this._symbols[symbol].tickSize;
		}

		return (price.toFixed(Math.ceil(Math.abs(Math.log10(tickSize)))));
	}


	async normalizeQuantity(quantity, symbol) {
		await this.init();
		symbol = this.normalizeSymbol(symbol);

		let quantityIncrement = 0.000000000001;
		if (this._symbols[symbol]) {
			quantityIncrement = this._symbols[symbol].quantityIncrement;
		}

		return (quantity.toFixed(Math.ceil(Math.abs(Math.log10(quantityIncrement)))));
	}

	async getHistoryOrders(params = {}) {
		// https://api.hitbtc.com/#spot-orders-history
		let url = 'spot/history/order?limit=1000';

		if (params.symbol) {
			url += '&symbol='+(''+params.symbol).toUpperCase();
		}
		if (params.offset) {
			url += '&offset='+params.offset;
		}

		try {
			let resp = await this.apiGet(url);
			return resp.data;
		} catch(e) {
			return [];
		}
	}

	normalizeSymbol(symbol) {
		let upperSymbol = (''+symbol).toUpperCase();

		if (this._symbols[upperSymbol]) {
			return upperSymbol;
		} else if (this._symbols[upperSymbol+'T']) { // USD -> USDT in Api V3
			return upperSymbol+'T';
		}
	}

	normalizeCurrency(currency) {
		let upperCurrency = (''+currency).toUpperCase();

		if (this._currencies[upperCurrency]) {
			return upperCurrency;
		} else if (this._currencies[upperCurrency+'T']) { // USD -> USDT in Api V3
			return upperCurrency+'T';
		}
	}

	async getAllSymbols() {
		let url = 'public/symbol';

		let resp = null;
		try {
			resp = await this.apiGet(url);
		} catch(e) {
			console.error(e);

			return null;
		}

		if (resp && resp.data) {
			// transform to v2 style
			const ret = [];
			for (let id in resp.data) {
				const dataItem = resp.data[id];
				const item = {
					id: id,
					baseCurrency: dataItem.base_currency,
					quoteCurrency: dataItem.quote_currency,
					quantityIncrement: dataItem.quantity_increment,
					tickSize: dataItem.tick_size,
					takeLiquidityRate: dataItem.take_rate,
				    provideLiquidityRate: dataItem.make_rate,
				    feeCurrency: dataItem.fee_currency,
				    marginTrading: dataItem.margin_trading,
				    maxInitialLeverage: dataItem.max_initial_leverage,
				    type: dataItem.type,
				};

				ret.push(item);
			}

			return ret;
		}

		return null;
	}


	async getSymbolInfo(symbol) {
		await this.init();

		symbol = this.normalizeSymbol(symbol);
		let url = 'public/symbol/'+symbol+'';

		let resp = null;
		try {
			resp = await this.apiGet(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data) {
			return {
					id: symbol,
					baseCurrency: dataItem.base_currency,
					quoteCurrency: dataItem.quote_currency,
					quantityIncrement: dataItem.quantity_increment,
					tickSize: dataItem.tick_size,
					takeLiquidityRate: dataItem.take_rate,
				    provideLiquidityRate: dataItem.make_rate,
				    feeCurrency: dataItem.fee_currency,
				    marginTrading: dataItem.margin_trading,
				    maxInitialLeverage: dataItem.max_initial_leverage,
				    type: dataItem.type,
				};
		}

		return null;
	}

    async getLastD1Candle(symbol) {
		await this.init();

		symbol = this.normalizeSymbol(symbol);

        let fromTimeISO = moment().subtract(1, 'day').startOf('day').toISOString();
        let toTimeISO = moment().endOf('day').toISOString();

        let url = 'public/candles?symbols='+symbol+'&period=D1&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1';

        let resp = await this.apiGet(url);

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
                        volumeQuote: parseFloat(row.volume_quote, 10),
                    };
                })[0];
            }

        } catch(e) {}

        return {};
    }

	async getM5Candles(symbol, fromTime, toTime) {
		await this.init();

		symbol = this.normalizeSymbol(symbol);

		// symbol = BTCUSD
		let fromTimeISO = moment(fromTime).toISOString();
		let toTimeISO = moment(toTime).toISOString();

		let url = 'public/candles?symbols='+symbol+'&period=M5&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1000';

		// console.log(url);

		let resp = await this.apiGet(url);

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
					volumeQuote: parseFloat(row.volume_quote, 10),
				};
			});
		}

		return [];
	}

    async getTickers(symbols) {
		await this.init();
        let symbolsNormalized = [];
        for (let symbol of symbols) {
            symbolsNormalized.push(this.normalizeSymbol(symbol));
        }

        const ret = {};
        for (let symbol of symbolsNormalized) {
        	const ticker = await this._hitBtcTickers.getTicker(symbol);
        	ret[symbol] = ticker;
        }

        return ret;
    }

	async getTicker(symbol) {
		await this.init();
		symbol = this.normalizeSymbol(symbol);

		return await this._hitBtcTickers.getTicker(symbol);
	}


	async getTradingBalance() {
		let url = 'spot/balance';
		let resp = await this.apiGet(url);

		let ret = [];
		for (let item of resp.data) {
			if (item.available != '0' || item.reserved != '0') {
				ret.push(item);
			}
		}

		return ret;
	}

	async getAccountBalance() {
		let url = 'wallet/balance';
		let resp = await this.apiGet(url);

		let ret = [];
		for (let item of resp.data) {
			if (item.available != '0' || item.reserved != '0') {
				ret.push(item);
			}
		}

		return ret;
	}

	async transferFromTradingBalance(params) {
		await this.init();

		let url = 'wallet/transfer';

		let currency = this.normalizeCurrency(params.currency);
		let amount = params.amount;

		let data = {
			currency: currency,
			amount: amount,
			source: 'spot',
			destination: 'wallet',
		};

		try {
			let resp = await this.apiPost(url, data);
			if (resp && resp.data) {
				return true;
			}
		} catch(e) {
			// console.log(e);
		}

		return false;
	}


	async transferToTradingBalance(params) {
		await this.init();

		let url = 'wallet/transfer';

		let currency = this.normalizeCurrency(params.currency);
		let amount = params.amount;

		let data = {
			currency: currency,
			amount: amount,
			source: 'wallet',
			destination: 'spot',
		};

		try {
			let resp = await this.apiPost(url, data);
			if (resp && resp.data) {
				return true;
			}
		} catch(e) {
			// console.log(e);
		}

		return false;
	}
};

module.exports = HitBtcApi;