const MarketTraderBidWorker = require('./MarketTraderBidWorker.js');
const MarketClosedBid = require('./MarketClosedBid.js');
const HistoricalMarket = require('./HistoricalMarket.js');

const RealMarketData = require('./RealMarketData.js');
const TradingApi = require('./TradingApi.js');

const BaseStrategy = require('../strategies/Base.js');

class MarketTrader {
	constructor(params = {}) {
		this._logger = params.logger || null;

		this._bidWorkers = [];
		this._closedBids = [];

		this._originalOperatingBalance = params.operatingBalance || 2000;
		this._operatingBalance = this._originalOperatingBalance;
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

	log(...fArgs) {
		if (this._logger) {
			this._logger.info.apply(this._logger, fArgs);
		}
	}

	get lastRunPriceCombined() {
		return this._lastRunPriceCombined;
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

	get symbol() {
		return this._symbol;
	}

	async prepareSymbolInfo() {
		if (this._symbolInfoPrepared) {
			return true;
		}

		this.log('Getting symbol info: '+this._symbol);

		const realMarket = new RealMarketData();
		const symbolInfo = await realMarket.getSymbolInfo(this._symbol);

		if (symbolInfo.id !== this._symbol) {
			throw new Error('Invalid symbol '+this._symbol);
		}

		this._tickSize = parseFloat(symbolInfo.tickSize, 10);
		this.log('Tick size: '+this._tickSize);
		this._quantityIncrement = parseFloat(symbolInfo.quantityIncrement, 10);
		this.log('Quantity increment: '+this._quantityIncrement);

		this._baseCurrency = symbolInfo.baseCurrency;
		this.log('Base currency: '+this._baseCurrency);
		this._quoteCurrency = symbolInfo.quoteCurrency;
		this.log('Quote currency: '+this._quoteCurrency);

		if (!this._tickSize || this._tickSize < 0) this._tickSize = 0;
		if (!this._quantityIncrement || this._quantityIncrement < 0) this._quantityIncrement = 0;

		if (!this._tickSize || this._tickSize >= 1) {
			throw new Error('I am not sure tickSize is ok, please check: '+this._tickSize);
		}

		if (!this._quantityIncrement || this._quantityIncrement > 10) {
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

	getAllTimeProfit() {
		let profit = 0;
		for (let bidWorker of this._bidWorkers) {
			profit += bidWorker.getHistoricalProfit();
		}

		return profit;
	}

	getToSellItemAmount() {
		let amount = 0;
		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForSell() && !bidWorker.isArchived()) {
				amount += bidWorker._gonnaSell;
			}
		}

		return amount;
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

	async getEvenPrice() {
		let totalSpent = 0;
		let totalBought = 0;

		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForSell()) {
				let boughtAtPrice = bidWorker._boughtAtPrice;
				let boughtAmount = bidWorker._gonnaSell;

				let spent = boughtAtPrice * boughtAmount;

				totalSpent += spent;
				totalBought += boughtAmount;
			}
		}

		return (totalBought > 0) ? (totalSpent / totalBought) : 0;
	}

	async getProfitPrice() {
		let totalWaiting = 0;
		let totalBought = 0;

		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForSell()) {
				let waitingAtPrice = bidWorker._waitingForPrice;
				let boughtAmount = bidWorker._gonnaSell;

				let waiting = waitingAtPrice * boughtAmount;

				totalWaiting += waiting;
				totalBought += boughtAmount;
			}
		}

		return (totalBought > 0) ? (totalWaiting / totalBought) : 0;
	}

	async getAvailableCurrency() {
		// console.log(this.getUsedCurrency());
		return (await this._strategy.getMaxOperatingBalance() - this.getUsedCurrency());
	}

	getUsedCurrency() {
		let ret = 0;
		ret += this._blockedBalance;

		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForSell() && !bidWorker.isArchived()) {
				ret += bidWorker.operatingBalance;
			}
		}

		return ret;
	}

	async getPossibleBuyBidsCount() {
		const lastPrice = this._lastRunPriceCombined.price;
		const workOnBalance = await this._strategy.getMaxBid(lastPrice);
		const availableCurrency = await this.getAvailableCurrency();

		return Math.floor(availableCurrency / workOnBalance);
	}

	getOpenBuyBidsCount() {
		let i = 0;
		for (let bidWorker of this._bidWorkers) {
			if (bidWorker.isWaitingForBuy() && !bidWorker.isArchived()) {
				i++;
			}
		}

		return i;
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

	async addArchivedWorkerWaitingForBuyAt(price) {
		await this.prepareSymbolInfo();

		const bidWorker = new MarketTraderBidWorker({
			marketTrader: this,

			quantityIncrement: this._quantityIncrement,
			tickSize: this._tickSize,

			makerFeePercents: this._makerFeePercents,
			tradingApi: this._tradingApi, // we are passing null here if we are in simulation mode
		});

		bidWorker._waitingForPrice = price;
		bidWorker._originalTargetPrice = price;
		bidWorker._isArchived = true;

		this._bidWorkers.push(bidWorker);

		return bidWorker;
	}

	async addBidWorkerWaitingForBuyAt(price) {
		await this.prepareSymbolInfo();

		const availableCurrency = await this.getAvailableCurrency();

		const workOnBalance = await this._strategy.getMaxBid(price);
		const minBid = this._tickSize * 10;

		// console.error('minBid', minBid);
		// console.error('workOnBalance', workOnBalance);

		if (workOnBalance < minBid || workOnBalance > this._operatingBalance || workOnBalance > availableCurrency) {
			console.log('can not create', workOnBalance < minBid, workOnBalance > this._operatingBalance, workOnBalance > availableCurrency);
			console.log(workOnBalance, availableCurrency);
			console.log(workOnBalance, this._operatingBalance);
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
			this._itemBalance += amount;
			this._blockedBalance -= bidWorker.gonnaPay;

			this.log('Bought '+amount+' for '+bidWorker.gonnaPay+' price: '+priceValue);
		});

		bidWorker.on('sold', (priceValue, amount, profit)=>{
			this._profitBalance += profit;

			this._itemBalance -= amount;

			this._blockedBalance += bidWorker.gonnaPay;
		});

		this._bidWorkers.push(bidWorker);

		return bidWorker;
	}

	async archiveWaitingForBuyBidWorker(bidWorker) {
		let archived = await bidWorker.archiveWaitingForBuy();
		if (archived) {
			this._operatingBalance += bidWorker.gonnaPay;
			this._blockedBalance -= bidWorker.gonnaPay;

			return true;
		}

		return false;
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


			let lastCount = historyOrders.length;
			let offset = 1000;
			while (lastCount >= 1000) { // if count = limit, ask for more
				const moreItems = await this._tradingApi.getHistoryOrders({
					symbol: this._symbol,
					offset: offset,
				});

				historyOrders = historyOrders.concat(moreItems);
				lastCount = moreItems.length;
				offset += 1000;
			}

			let byOriginalPriceGroup = {

			};

			let mostRecentCreatedOrderDate = new Date(0);

			let orderToPriceGroup = (order)=>{

				order.createdAt = new Date(order.createdAt);
				order.updatedAt = new Date(order.updatedAt);

				// order.createdAt.setTime(order.createdAt.getTime() + Math.random()*1000)
				let clientOrderId = order.clientOrderId;
				if (clientOrderId.indexOf('_') != -1 && order.symbol == this._symbol) { // made by us
					let clientOrderIdItems = clientOrderId.split('_');

					let originalPrice = parseFloat(clientOrderIdItems[0], 10);
					let strategyName = clientOrderIdItems[1];

					// we process only orders placed on same trading pair by same strategy name
					if (strategyName == this._strategyName) {
						if (order.createdAt > mostRecentCreatedOrderDate) {
							mostRecentCreatedOrderDate = order.createdAt;
						}

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

			    // this.log('There re '+orders.length+' orders on market in price of '+originalPriceValue);

			    let mostRecentOrder = orders[0];

			    if (mostRecentOrder.status == 'filled' && mostRecentOrder.side == 'buy') {
			    	// most recent was bought while we were offline
			    	this.log('There is filled buy order on price of '+originalPriceKey+' adding to be sold order over it');

			    	this._mode = 'simulation';
			    	// console.log(mostRecentOrder);
			    	// console.log(mostRecentOrder.price);
			    	// console.log(mostRecentOrder.clientOrderId);
			    	let bidWorker = await this.addBidWorkerWaitingForBuyAt(originalPriceValue);
			    	bidWorker._gonnaBuy = parseFloat(mostRecentOrder.cumQuantity, 10);

			    	this._mode = 'market';
			    	// if (mostRecentOrder.clientOrderId == '0.680678_Simple_589609') die;

			    	await bidWorker.wasBought(mostRecentOrder);

			    	if (orders.length > 1) {
			    		for (let i = 1; i < orders.length; i++) {
			    			bidWorker.appendHistoryClosedBidOrder(orders[i]);
			    		}
			    	}
			    } else if (mostRecentOrder.status == 'filled' && mostRecentOrder.side == 'sell') {
			    	if (mostRecentOrder.updatedAt > mostRecentCreatedOrderDate) { // order was sold while we we offline
				    	this.log('Sold while we were offline');

				    	try {
					    	let prevOrder = null;
					    	if (orders[1] && orders[1].side == 'buy' && orders[1].status == 'filled') {
					    		prevOrder = orders[1];
					    	}

					    	if (prevOrder) {
						    	this._mode = 'simulation';
						    	let bidWorker = await this.addBidWorkerWaitingForBuyAt(originalPriceValue);
						    	bidWorker._gonnaBuy = parseFloat(prevOrder.cumQuantity, 10);
						    	await bidWorker.wasBought(prevOrder);

					    		let resellAtPrice = parseFloat(mostRecentOrder.price, 10);

						    	this._mode = 'market';
						    	await bidWorker.wasSold(mostRecentOrder);

						    	if (orders.length > 2) {
						    		for (let i = 2; i < orders.length; i++) {
						    			bidWorker.appendHistoryClosedBidOrder(orders[i]);
						    		}
						    	}
					    	}
				    	} catch(e) {
				    		console.error(e);
				    	}
			    	} else {
				    	this.log('Sold long time ago, we are ignoring them');
				    	// console.log(mostRecentOrder.updatedAt, mostRecentCreatedOrderDate)
				    	//
				    	this._mode = 'simulation';
				    	let bidWorker = await this.addArchivedWorkerWaitingForBuyAt(originalPriceValue);
				    	bidWorker._isArchived = true;

			    		for (let i = 0; i < orders.length; i++) {
			    			bidWorker.appendHistoryClosedBidOrder(orders[i]);
			    		}

			    		console.log('had profit of', bidWorker.getHistoricalProfit());

				    	this._mode = 'market';
			    	}
			    } else if (mostRecentOrder.status == 'partiallyFilled' || mostRecentOrder.status == 'new') {
			    	// order is active actually
			    	this.log('There is pending order on price of '+originalPriceKey+' side: '+mostRecentOrder.side);

			    	this._mode = 'simulation';
			    	let bidWorker = await this.addBidWorkerWaitingForBuyAt(originalPriceValue);

			    	if (mostRecentOrder.side == 'sell' && bidWorker) {
			    		let resellAtPrice = parseFloat(mostRecentOrder.price, 10);
			    		await bidWorker.wasBought(null, resellAtPrice);
			    	} else {
			    		bidWorker._gonnaBuy = parseFloat(mostRecentOrder.quantity, 10);
			    	}

			    	bidWorker._lastOrderClientOrderId = mostRecentOrder.clientOrderId;

			    	this._mode = 'market';

			    	if (orders.length > 1) {
			    		for (let i = 1; i < orders.length; i++) {
			    			bidWorker.appendHistoryClosedBidOrder(orders[i]);
			    		}
			    	}
			    } else {
			    	this.log('They are cancelled probably');

			    	this._mode = 'simulation';
			    	let bidWorker = await this.addArchivedWorkerWaitingForBuyAt(originalPriceValue);
			    	bidWorker._isArchived = true;

		    		for (let i = 0; i < orders.length; i++) {
		    			bidWorker.appendHistoryClosedBidOrder(orders[i]);
		    		}
			    	this._mode = 'market';
			    }
			}


	        let tb = await this._tradingApi.getTradingBalance();
	        for (let tbItem of tb) {
	        	if (tbItem.currency == this._quoteCurrency) {
	        		this._operatingBalance = await this._strategy.getMaxOperatingBalance(parseFloat(tbItem.available, 10));
	        		// this._blockedBalance = 0;//parseFloat(tbItem.reserved);
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