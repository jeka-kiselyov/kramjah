const Slimbot = require('slimbot');
const text2png = require('text2png');
const asciichart = require ('asciichart');

const Table = require('cli-table3');

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const HistoricalMarket = require('./HistoricalMarket.js');
const RealMarketData = require('./RealMarketData.js');

const MarketStatistics = require('./MarketStatistics.js');

const moment = require('moment');

require('dotenv').config();

class Notificator {
	constructor(params = {}) {
	}

	static getMarketStatistics() {
		if (!this._marketStatistics) {
			this._marketStatistics = new MarketStatistics();
		}

		return this._marketStatistics;
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

	static async log(message, markdown = false) {
		if (!(await this.initialize() )) return false;

		this._slimbot.sendMessage(process.env.TELEGRAM_NOTIFY_USER_ID, message, {parse_mode: (markdown ? 'Markdown' : undefined)});
	}

	static async logAccountBalance(marketTraders) {
		const marketStatistics = this.getMarketStatistics();
		const estimatedBalances = await marketStatistics.getEstimatedAccountBalance();
		const balances = await marketStatistics.getAccountBalances(marketTraders);

		let text = '';
		for (let currency in balances) {
			const balance = balances[currency];
			text += ''+currency+' Main Account: '+balance.mainAsString+' Avail: '+balance.availableAsString+' Reserved: '+balance.reservedAsString+' To Be Reserved: '+balance.toBeReservedAsString+"\n\n";
		}

        text += "\nBTC Price: "+estimatedBalances.BTC.price;
        text += "\nEstimated BTC: "+estimatedBalances.BTC.totalAsString;
        text += "\nEstimated USD: "+estimatedBalances.USD.totalAsString;


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

	static async logDispersionCommand(command, marketTraders) {
		let everything = false;
		let baseCurrency = null;
		let quoteCurrency = null;

		if (command.indexOf('all_dispersions') !== -1) {
			everything = true;
		} else {
			let commandSplet = (''+command).split('_');
			baseCurrency = commandSplet[1];
			quoteCurrency = commandSplet[2];
		}

		for (let marketTraderKey in marketTraders) {
            const marketTrader = marketTraders[marketTraderKey];

            if (everything || (marketTrader._baseCurrency == baseCurrency && marketTrader._quoteCurrency == quoteCurrency)) {
            	await this.logMarketTraderDispersion(marketTrader);
            }
        }
	}

	static async logMarketTraderDispersion(marketTrader) {
		if (!(await this.initialize() )) return false;

		const marketStatistics = this.getMarketStatistics();
		const dispersion = await marketStatistics.getOrdersDispersion(marketTrader);

		// let text = '';

		// text += ''+marketTrader._baseCurrency+'/'+marketTrader._quoteCurrency+" open orders dispersion\n";
		// text += "```\n";

		let baseCurrency = '';
		if (dispersion[0]) {
			baseCurrency = dispersion[0].baseCurrency;
		}

		const table = new Table({
		    head: ['Price', 'Open Sell', 'Open Buy', 'HODLing '+baseCurrency, 'Days Since', 'Closed Sales', 'Expected Profit'],
			style: {
				'padding-left': 1,
				'padding-right': 1,
				head: [],
				border: [],
			},
		});

		for (let dispersionItem of dispersion) {
			table.push([dispersionItem.minPriceAsString + ' .. ' + dispersionItem.maxPriceAsString, dispersionItem.openOrders.sell, dispersionItem.openOrders.buy, dispersionItem.itemToSellAsString, dispersionItem.daysSinceMostRecentFilled, dispersionItem.filledSoldOrders, dispersionItem.expectedProfitAsString]);
		}

		let text = ''+marketTrader._baseCurrency+'/'+marketTrader._quoteCurrency+" orders\n";
		text += table.toString();

		let caption = ''+marketTrader._baseCurrency+'/'+marketTrader._quoteCurrency+" open orders dispersion\n";

		caption += "\n"+'Chart: /chart_'+marketTrader._baseCurrency+'_'+marketTrader._quoteCurrency;
		caption += "\n";
		caption += "\n/traders";

		await this.uploadTextAsImage(text, caption);
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

	static async uploadTextAsImage(text, caption) {
		const buffer = text2png(text, {color: 'white', backgroundColor: '#002255', font: '14px monospace', output: 'buffer'});
		const tempFileName = path.join(__dirname, '../data/tmp.png');
		await fsp.writeFile(tempFileName, buffer);
		let fileUpload = fs.createReadStream(tempFileName);

		const resp = await this._slimbot.sendPhoto(process.env.TELEGRAM_NOTIFY_USER_ID, fileUpload, {caption: caption});
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
		caption += "\n"+'Dispersion: /dispersion_'+marketTrader._baseCurrency+'_'+marketTrader._quoteCurrency;
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

		await this.uploadTextAsImage(content, caption);

		// const buffer = text2png(content, {color: 'white', backgroundColor: '#002255', font: '14px monospace', output: 'buffer'});
		// const tempFileName = path.join(__dirname, '../data/chart.png');
		// await fsp.writeFile(tempFileName, buffer);
		// let fileUpload = fs.createReadStream(tempFileName);

		// const resp = await this._slimbot.sendPhoto(process.env.TELEGRAM_NOTIFY_USER_ID, fileUpload, {caption: caption});
		// const resp = await this._slimbot.sendPhoto(process.env.TELEGRAM_NOTIFY_USER_ID, readable);
	}

};

module.exports = Notificator;