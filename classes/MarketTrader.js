const MarketTraderBidWorker = require('./MarketTraderBidWorker.js');
const MarketClosedBid = require('./MarketClosedBid.js');
const HistoricalMarket = require('./HistoricalMarket.js');

const RealMarketData = require('./RealMarketData.js');
const TradingApi = require('./TradingApi.js');

const BaseStrategy = require('../strategies/Base.js');

class MarketTrader {
	constructor(params = {}) {
		this._bidWorkers = [];
		this._closedBids = [];

		this._originalOperatingBalance = 1000;
		this._operatingBalance = 1000;
		this._profitBalance = 0;
		this._blockedBalance = 0;

		this._itemBalance = 0;
		this._itemBalanceBasedOnLastPrice = 0;

		this._firstRunPriceCombined = null;
		this._lastRunPriceCombined = null;

		this._strategyName = params.strategyName;
		if (this._strategyName.length > 10) {
			throw new Error('Please limit strategy name to 10 chars');
		}

		this._strategy = BaseStrategy.getStrategy(this._strategyName, this);

		if (!this._strategy) {
			throw new Error('Can not find strategy');
		}

		this._symbol = params.symbol;
		this._symbol = (''+this._symbol).toUpperCase();

		// this._baseCurrency = 'BTC'; // Name (code) of base currency
		// this._quoteCurrency = 'USD';
		// this._quantityIncrement = 0.00001; // Symbol quantity should be divided by this value with no remainder
		// this._tickSize = 0.01; // Symbol price should be divided by this value with no remainder

		this._makerFeePercents = 0.09; // hitbtc fees = 0.09%

		this._mode = params.mode || 'simulation'; // 'simulation' or 'market';

		this._tradingApi = null;
		if (this._mode == 'market') {
			this._tradingApi = new TradingApi();
		}

		this._symbolInfoPrepared = false;
	}

	/**
	 * String we add to order id on market to know bid is related to this markettrader
	 * @return {String} [description]
	 */
	getClientOrderIdSuffix() {
		return this._strategyName;
	}

	get baseCurrency() {
		return this._baseCurrency;
	}

	get quoteCurrency() {
		return this._quoteCurrency;
	}

	async prepareSymbolInfo() {
		if (this._symbolInfoPrepared) {
			return true;
		}

		const realMarket = new RealMarketData();
		const symbolInfo = await realMarket.getSymbolInfo(this._symbol);

		if (symbolInfo.id !== this._symbol) {
			throw new Error('Invalid symbol '+this._symbol);
		}

		this._tickSize = parseFloat(symbolInfo.tickSize, 10);
		this._quantityIncrement = parseFloat(symbolInfo.quantityIncrement, 10);

		this._baseCurrency = symbolInfo.baseCurrency;
		this._quoteCurrency = symbolInfo.quoteCurrency;

		if (!this._tickSize || this._tickSize < 0) this._tickSize = 0;
		if (!this._quantityIncrement || this._quantityIncrement < 0) this._quantityIncrement = 0;

		if (!this._tickSize || this._tickSize >= 1) {
			throw new Error('I am not sure tickSize is ok, please check: '+this._tickSize);
		}
		if (!this._quantityIncrement || this._quantityIncrement > 1) {
			throw new Error('I am not sure quantityIncrement is ok, please check: '+this._quantityIncrement);
		}

		if (!this._baseCurrency || !this._quoteCurrency) {
			throw new Error('Base/Quote currencies are not ok');
		}

		this._symbolInfoPrepared = true;
	}

	getEstimatedPortfolioPrice() {
		return this.operatingBalance + this.profitBalance + this.blockedBalance + this._itemBalanceBasedOnLastPrice;
	}

	getIfWouldHODLPortfolioPrice() {
		return (this._originalOperatingBalance / this._firstRunPriceCombined.price) * this._lastRunPriceCombined.price;
	}

	get blockedBalance() {
		return this._blockedBalance;
	}

	get profitBalance() {
		return this._profitBalance;
	}

	get operatingBalance() {
		return this._operatingBalance;
	}

	get itemBalance() {
		return this._itemBalance;
	}

	get itemBalanceBasedOnLastPrice() {
		return this._itemBalanceBasedOnLastPrice;
	}

	isThereBidWorkerWaitingForBuyAt(price, plusMinusPercents) {
		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForBuyAt(price, plusMinusPercents)) {
				return true;
			}
		}

		return false;
	}

	isThereBidWorkerWasBoughtAt(price, plusMinusPercents) {
		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.wasBoughtAt(price, plusMinusPercents)) {
				return true;
			}
		}

		return false;
	}

	isThereBidWorkerInTargetPriceAt(price, plusMinusPercents) {
		for (let bidWorker of this._bidWorkers) {
			if (!bidWorker.isArchived() && bidWorker.originalTargetPriceIsIn(price, plusMinusPercents)) {
				return true;
			}
		}

		return false;
	}

	async addBidWorkerWaitingForBuyAt(price) {
		await this.prepareSymbolInfo();

		const workOnBalance = await this._strategy.getMaxBid(price);
		const minBid = this._tickSize * 10;

		// console.error('minBid', minBid);
		// console.error('workOnBalance', workOnBalance);

		if (workOnBalance < minBid || workOnBalance > this._operatingBalance) {
			return false;
		}

		const bidWorker = new MarketTraderBidWorker({
			marketTrader: this,

			quantityIncrement: this._quantityIncrement,
			tickSize: this._tickSize,

			makerFeePercents: this._makerFeePercents,
			tradingApi: this._tradingApi, // we are passing null here if we are in simulation mode
		});

		bidWorker.setOperatingBalance(workOnBalance);
		await bidWorker.waitForBuyAt(price);
		bidWorker.setOperatingBalance(bidWorker.gonnaPay);

		this._operatingBalance -= bidWorker.gonnaPay;
		this._blockedBalance += bidWorker.gonnaPay;

		bidWorker.on('bought', (priceValue, amount)=>{
			const closedBid = new MarketClosedBid({
				atPrice: priceValue,
				isBought: true,
			});
			this._closedBids.unshift(closedBid);

			this._itemBalance += amount;
			this._blockedBalance -= bidWorker.gonnaPay;
		});

		bidWorker.on('sold', (priceValue, amount, profit)=>{
			const closedBid = new MarketClosedBid({
				atPrice: priceValue,
				profit: profit,
				isBought: false,
			});
			this._closedBids.unshift(closedBid);

			this._profitBalance += profit;

			this._itemBalance -= amount;

			this._blockedBalance += bidWorker.gonnaPay;

			bidWorker.takeOutProfit(profit);
		});

		this._bidWorkers.push(bidWorker);

		return bidWorker;
	}

	archiveWaitingForBuyBidWorker(bidWorker) {
		if (bidWorker.archiveWaitingForBuy()) {
			this._operatingBalance += bidWorker.gonnaPay;
			this._blockedBalance -= bidWorker.gonnaPay;;
		}
	}

	/**
	 * restore bid workers on app intialization based on recent bids on market
	 * @return {[type]} [description]
	 */
	async restoreDataFromMarket() {
		await this.prepareSymbolInfo();

		try {

			let activeOrders = await this._tradingApi.getActiveOrders({
				symbol: this._symbol,
			});
			let historyOrders = await this._tradingApi.getHistoryOrders({
				symbol: this._symbol,
			});

			let byOriginalPriceGroup = {

			};

			let orderToPriceGroup = (order)=>{

				order.createdAt = new Date(order.createdAt);
				// order.createdAt.setTime(order.createdAt.getTime() + Math.random()*1000)
				let clientOrderId = order.clientOrderId;
				if (clientOrderId.indexOf('_') != -1 && order.symbol == this._symbol) { // made by us
					let clientOrderIdItems = clientOrderId.split('_');

					let originalPrice = parseFloat(clientOrderIdItems[0], 10);
					let strategyName = clientOrderIdItems[1];

					// we process only orders placed on same trading pair by same strategy name
					if (strategyName == this._strategyName) {
						if (!byOriginalPriceGroup[''+originalPrice]) {
							byOriginalPriceGroup[''+originalPrice] = [];
						}

						byOriginalPriceGroup[''+originalPrice].push(order);
					} else {
					}
				}
			}

			for (let order of activeOrders) {
				orderToPriceGroup(order);
			}
			for (let order of historyOrders) {
				orderToPriceGroup(order);
			}

			for (let originalPriceKey in byOriginalPriceGroup) {
				let originalPriceValue = parseFloat(originalPriceKey, 10);
				let orders = byOriginalPriceGroup[originalPriceKey];

			    orders.sort(function(a, b) { return b.createdAt - a.createdAt; }); /// sort DESC by createdAt

			    console.log(orders);

			    let mostRecentOrder = orders[0];

			    if (mostRecentOrder.status == 'filled' && mostRecentOrder.side == 'buy') {
			    	// most recent was bought while we were offline
			    	console.log(originalPriceKey, 'filled buy');

			    	this._mode = 'simulation';
			    	let bidWorker = await this.addBidWorkerWaitingForBuyAt(originalPriceValue);

			    	this._mode = 'market';
			    	await bidWorker.wasBought();
			    } else if (mostRecentOrder.status == 'partiallyFilled' || mostRecentOrder.status == 'new') {
			    	// order is active actually
			    	console.log(originalPriceKey, 'active');

			    	this._mode = 'simulation';
			    	let bidWorker = await this.addBidWorkerWaitingForBuyAt(originalPriceValue);

			    	if (mostRecentOrder.side == 'sell') {
			    		let resellAtPrice = parseFloat(mostRecentOrder.price, 10);
			    		await bidWorker.wasBought(resellAtPrice);
			    	}

			    	bidWorker._lastOrderClientOrderId = mostRecentOrder.clientOrderId;

			    	this._mode = 'market';
			    }
			}


	        let tb = await this._tradingApi.getTradingBalance();
	        for (let tbItem of tb) {
	        	if (tbItem.currency == this._quoteCurrency) {
	        		this._operatingBalance = await this._strategy.getMaxOperatingBalance(parseFloat(tbItem.available, 10));
	        		this._blockedBalance = parseFloat(tbItem.reserved);
	        	}
	        	if (tbItem.currency == this._baseCurrency) {
	        		this._itemBalance = parseFloat(tbItem.available, 10) + parseFloat(tbItem.reserved);
	        	}

	        	this._profitBalance = 0;
	        	this._originalOperatingBalance = null;
	        }

		} catch(e) {
			console.error(e);
			throw new Error('Can not restore data from your trading account. Please check api keys');
		}
	}

	async processNewCombinedPrice(priceCombined) {
		await this.prepareSymbolInfo();

		if (this._firstRunPriceCombined === null) {
			this._firstRunPriceCombined = priceCombined;
		}
		this._lastRunPriceCombined = priceCombined;
		this._itemBalanceBasedOnLastPrice = this.itemBalance * priceCombined.price;

		if (this._originalOperatingBalance == null) {
			this._originalOperatingBalance = this.getEstimatedPortfolioPrice();
		}

		for (let bidWorker of this._bidWorkers) {
			await bidWorker.processNewCombinedPrice(priceCombined);

			// if (bidWorker.isWaitingForBuyLowerThan(priceCombined.low * 0.7)) {
			// 	/// close bids if they are waiting to buy with too low price
			// 	await this.archiveWaitingForBuyBidWorker(bidWorker);
			// }

			// if (this.operatingBalance < 10) {
			// 	if (bidWorker.isWaitingForBuyLowerThan(priceCombined.low * 0.95)) {
			// 		/// close bids if they are waiting to buy with too low price
			// 		await this.archiveWaitingForBuyBidWorker(bidWorker);
			// 	}
			// }
		}

		await this._strategy.processNewCombinedPrice();

		// const intervalHOUR1 = await priceCombined.getInterval(HistoricalMarket.INTERVALS.HOUR1);
		// const shiftsHOUR1 = await intervalHOUR1.getShifts(3);

		// if (shiftsHOUR1[shiftsHOUR1.lenght - 1] > -1 || shiftsHOUR1[shiftsHOUR1.lenght - 2] > -1) {
		// 	// do not add any buy bids if price is rising in last 2 hours
		// 	return;
		// }


		// let minPriceDownPercent = 0.99;
		// let priceDownPercentStep = 0.001;
		// let doNotAddIfThereReSamePriceInPercentInterval = 0.2;
		// // let doNotAddIfThereReSamePriceInPercentInterval = 1.2;
		// let maxPriceDownsCount = 20;
		// const priceTargets = [];

		// for (let i = 0; i < maxPriceDownsCount; i++) {
		// 	priceTargets.push(priceCombined.low * minPriceDownPercent);
		// 	minPriceDownPercent -= priceDownPercentStep;
		// }

		// for (let priceTarget of priceTargets) {
		// 	if (!this.isThereBidWorkerInTargetPriceAt(priceTarget, doNotAddIfThereReSamePriceInPercentInterval)) {
		// 		await this.addBidWorkerWaitingForBuyAt(priceTarget);
		// 	}
		// }
	}
};

module.exports = MarketTrader;