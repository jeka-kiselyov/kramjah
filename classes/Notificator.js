const Slimbot = require('slimbot');
const text2png = require('text2png');
const asciichart = require ('asciichart');

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const HistoricalMarket = require('./HistoricalMarket.js');
const RealMarketData = require('./RealMarketData.js');
const moment = require('moment');

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

	static async logAccountBalance(tradingApi, marketTraders) {
		const tickSizes = {
			'USD': 0.01,
		};
		const realMarketData = new RealMarketData();
    	let allSymbols = await realMarketData.getAllSymbols();
		for (let symbolInfo of allSymbols) {
			if (!tickSizes[symbolInfo.quoteCurrency]) {
				tickSizes[symbolInfo.quoteCurrency] = symbolInfo.tickSize;
			}
			if (!tickSizes[symbolInfo.baseCurrency]) {
				tickSizes[symbolInfo.baseCurrency] = symbolInfo.quantityIncrement;
			}
		}
		const priceToString = (currency, price)=>{
			if (tickSizes[currency]) {
				return (parseFloat(price)).toFixed(Math.ceil(Math.abs(Math.log10(tickSizes[currency]))));
			}

			return price;
		};


		let text = '';

        const mainBalance = await tradingApi.getAccountBalance();
        const tradingBalance = await tradingApi.getTradingBalance();
        for (let mainBalanceItem of mainBalance) {
	        for (let tradingBalanceItem of tradingBalance) {
	        	if (mainBalanceItem.currency == tradingBalanceItem.currency) {
	        		if (mainBalanceItem.available || tradingBalanceItem.available || tradingBalanceItem.reserved) {
	        			let toBeUsedByTraders = 0;
						for (let marketTraderKey in marketTraders) {
				            const marketTrader = marketTraders[marketTraderKey];
	        				if (marketTrader._quoteCurrency == mainBalanceItem.currency) {
	        					toBeUsedByTraders += await marketTrader.getAvailableCurrency();
	        				}
	        			}

		                text += ''+mainBalanceItem.currency+' Main Account: '+priceToString(mainBalanceItem.currency, mainBalanceItem.available)+' Avail: '+priceToString(mainBalanceItem.currency, tradingBalanceItem.available)+' Reserved: '+priceToString(mainBalanceItem.currency, tradingBalanceItem.reserved)+' To Be Reserved: '+priceToString(mainBalanceItem.currency, toBeUsedByTraders)+"\n\n";
	        		}
	        	}
	        }
        }

        // calculate estimated total
        //
        try {
	    	let btcPrice = 0;
	    	let balanceBTC = 0;
	    	let balanceUSD = 0;
	        let estimatedUSD = 0;
	        let estimatedBTC = 0;
	        let toTransformItems = [];
	        let neededPairs = [];
	        for (let tradingBalanceItem of tradingBalance) {
	        	let itemValue = 0;

		        for (let mainBalanceItem of mainBalance) {
		        	if (mainBalanceItem.currency == tradingBalanceItem.currency) {
		        		itemValue += parseFloat(mainBalanceItem.available);
		        	}
	        	}
	        	itemValue += (parseFloat(tradingBalanceItem.available) + parseFloat(tradingBalanceItem.reserved));

	        	if (itemValue > 0) {
	        		if (tradingBalanceItem.currency === 'USD') {
	        			balanceUSD = itemValue;
	        			estimatedUSD += balanceUSD;
	        		} else if (tradingBalanceItem.currency === 'BTC') {
	        			balanceBTC = itemValue;
	        			estimatedBTC += balanceBTC;
	        		} else {
	        			let totalItem = itemValue;
	        			let toTransform = {
	        				currency: tradingBalanceItem.currency,
	        				value: totalItem,
	        				usdPair: null,
	        				btcPair: null,
	        			};

	        			for (let symbolInfo of allSymbols) {
	        				if (symbolInfo.quoteCurrency == 'USD' && symbolInfo.baseCurrency == tradingBalanceItem.currency) {
	        					toTransform.usdPair = symbolInfo.id.toUpperCase();
	        					neededPairs.push(toTransform.usdPair);
	        				}
	        				if (symbolInfo.quoteCurrency == 'BTC' && symbolInfo.baseCurrency == tradingBalanceItem.currency) {
	        					toTransform.btcPair = symbolInfo.id.toUpperCase();
	        					neededPairs.push(toTransform.btcPair);
	        				}
	        			}

	        			toTransformItems.push(toTransform);
	        		}
	        	}
	        }

	        if (toTransformItems.length) {
	        	neededPairs.push('BTCUSD');

	        	/// need to get all symbols as some of them may have special symbol name
	        	let tickers = await realMarketData.getTickers(neededPairs);
		        for (let symbol in tickers) {
		        	let ticker = tickers[symbol];

		        	for (let neededPair of toTransformItems) {
		        		if (neededPair.usdPair == symbol) {
		        			estimatedUSD += (neededPair.value * ticker.low);
		        		}
		        		if (neededPair.btcPair == symbol) {
		        			estimatedBTC += (neededPair.value * ticker.low);
		        		}
		        	}
		        }

		        /// and transform BTC and USD to eachother
		        let ticker = tickers['BTCUSD'];

		        estimatedUSD += (balanceBTC * ticker.low);
		        estimatedBTC += (balanceUSD / ticker.low);

		        btcPrice = ticker.low;
	        }


	        text += "\nBTC Price: "+priceToString('USD', btcPrice);
	        text += "\nEstimated BTC: "+priceToString('BTC', estimatedBTC);
	        text += "\nEstimated USD: "+priceToString('USD', estimatedUSD);

        } catch(e) {

        }


		text += "\n/traders";

        await this.log(text);
	}

	static async logMarketTraders(marketTraders) {
		let text = '';
		for (let marketTraderKey in marketTraders) {
            const marketTrader = marketTraders[marketTraderKey];
			text += "/chart_"+marketTrader._baseCurrency+'_'+marketTrader._quoteCurrency+"\n";
		}


		text += "/all_charts\n";

		text += "\n/balance";

        await this.log(text);
	}

	static async logChartCommand(command, marketTraders) {
		let everything = false;
		let baseCurrency = null;
		let quoteCurrency = null;

		if (command.indexOf('all_charts') !== -1) {
			everything = true;
		} else {
			let commandSplet = (''+command).split('_');
			baseCurrency = commandSplet[1];
			quoteCurrency = commandSplet[2];
		}

		for (let marketTraderKey in marketTraders) {
            const marketTrader = marketTraders[marketTraderKey];

            if (everything || (marketTrader._baseCurrency == baseCurrency && marketTrader._quoteCurrency == quoteCurrency)) {
            	await this.logMarketTraderChart(marketTrader);
            }
        }
	}

	static async logMarketTraderChart(marketTrader) {
		if (!(await this.initialize() )) return false;

		let chartLabel = '15 minutes interval';

		const priceCombined = marketTrader._lastRunPriceCombined;
		const combinedPriceForTheChart = await priceCombined.getInterval(HistoricalMarket.INTERVALS.MIN15);

		let maxPrevPrices = 56;

		const values = new Array(maxPrevPrices);
		const highs = new Array(maxPrevPrices);
		const lows = new Array(maxPrevPrices);

		let dateTo = moment(new Date(priceCombined.time));
		let dateFrom = null;
		let prevPrice = combinedPriceForTheChart;
		for (let i = 0; i < maxPrevPrices; i++) {
			values[maxPrevPrices - 1 - i] = prevPrice.price;
			highs[maxPrevPrices - 1 - i] = prevPrice.high;
			lows[maxPrevPrices - 1 - i] = prevPrice.low;

			prevPrice = await prevPrice.getPrev();
		}
		dateFrom = moment(new Date(prevPrice.time));

		let title = ''+marketTrader._baseCurrency+'/'+marketTrader._quoteCurrency;
		let caption = title;
		let priceString = priceCombined.price.toFixed(Math.ceil(Math.abs(Math.log10(marketTrader._tickSize))));

		title += ' - '+chartLabel+' - '+dateTo.format('MMMM Do YYYY, HH:mm');
		title += ' - ' + priceString;

		caption += ', '+priceString;

		let allTimeProfit = marketTrader.getAllTimeProfit();
		let currentLoose = await marketTrader.getCurrentLoose();
		const possibleBuyBids = await marketTrader.getPossibleBuyBidsCount();

		if (currentLoose) {
			currentLoose = currentLoose.toFixed(Math.ceil(Math.abs(Math.log10(marketTrader._tickSize)))) + marketTrader._quoteCurrency;
		}
		if (allTimeProfit) {
			allTimeProfit = allTimeProfit.toFixed(Math.ceil(Math.abs(Math.log10(marketTrader._tickSize)))) + marketTrader._quoteCurrency;
		} else {
			allTimeProfit = (0).toFixed(Math.ceil(Math.abs(Math.log10(marketTrader._tickSize)))) + marketTrader._quoteCurrency;
		}

		caption += "\n"+'Open bids: '+marketTrader.getOpenBuyBidsCount()+'(buy), '+marketTrader.getOpenSellBidsCount()+'(sell)';
		caption += "\n"+'All time profit: '+allTimeProfit+' '+(currentLoose ? ('- '+currentLoose) : '');
		caption += "\n"+'Possible buy bids: '+possibleBuyBids;
		caption += "\n";
		caption += "\n/traders";

		const chartData = [lows, highs];
		let content = asciichart.plot(chartData,
			{
				height: 20,
				offset: 2,
			    format:  (x, i)=>{
			    	let length = Math.ceil(Math.abs(Math.log10(marketTrader._tickSize)));
			    	let totalLength = length + 5 + 1;
			    	return (' '.repeat(totalLength) + x.toFixed(length)).slice(-totalLength);
			    },
			    colors: [
			        undefined,
			        undefined,
			        undefined,
			        undefined, // equivalent to default
			    ],
			});

		content = title + "\n" + content + "\nKramJah";

		const buffer = text2png(content, {color: 'white', backgroundColor: '#002255', font: '14px monospace', output: 'buffer'});
		const tempFileName = path.join(__dirname, '../data/chart.png');
		await fsp.writeFile(tempFileName, buffer);
		let fileUpload = fs.createReadStream(tempFileName);

		const resp = await this._slimbot.sendPhoto(process.env.TELEGRAM_NOTIFY_USER_ID, fileUpload, {caption: caption});
		// const resp = await this._slimbot.sendPhoto(process.env.TELEGRAM_NOTIFY_USER_ID, readable);
	}

};

module.exports = Notificator;