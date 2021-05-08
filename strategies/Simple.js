const Base = require('./Base.js');

class Strategy extends Base {
	constructor(params) {
		super(params);
	}


	/**
	 * Take out portion of coin before selling bid back at higher price
	 * Useful if you want to accumulate some coin
	 * Like trading in ETH/USD
	 * Buy 0.1 eth for 1000 (total 100 usd)
	 * takeOutQuantityBeforeSell() == 0.01;
	 * getExpectedGrowthPercent() == 20;
	 * Sell 0.09 for 1200 (got 108 USD)
	 * Send 0.01 ETH to main account
	 * Send 8 USD to main account
	 * Place another buy bid for 0.1 eth for 1000 price (100 USD)
	 * @return {[type]} [description]
	 */
	async getTakeOutQuantityBeforeSell() {
		const marketTrader = this.getMarketTrader();          // MarketTrader instance
		const quantityIncrement = marketTrader._quantityIncrement;

		// should be dividable by quantityIncrement
		if (marketTrader.symbol == 'ETHUSD') {
			return quantityIncrement;
		}

		return 0;
	}

	/**
	 * Increaase ExpectedGrowthPercent by step if sell may produce less than getMinimumProfitForASale value in profit
	 * @param  {[type]} boughtAtPriceValue [description]
	 * @return {[type]}                    [description]
	 */
	async getMinimumProfitForASale(boughtAtPriceValue) {
		const maxBid = await this.getMaxBid(boughtAtPriceValue);
		const marketTrader = this.getMarketTrader();          // MarketTrader instance

		if (marketTrader.symbol == 'ETHUSD') {
			return 0.01;
		}

		return (maxBid / 50);
	}

	/**
	 * Method to overload: On initialization we determine how much money is available for this strategy to trade with
	 * totalQuoteCurrencyBalance is the total amount available in quote currency (USD when trading on BTCUSD) on your trading account
	 * return all totalQuoteCurrencyBalance or part of it
	 * @param  {Number} totalQuoteCurrencyBalance [description]
	 * @return {Number}                           [description]
	 */
	async getMaxOperatingBalance(totalQuoteCurrencyBalance) {
		const marketTrader = this.getMarketTrader();

		if (marketTrader._baseCurrency == 'ETH' || marketTrader._baseCurrency == 'BTC' || marketTrader._baseCurrency == 'LTC') {
			return 900;
		}
		if (marketTrader._quoteCurrency == 'USD') {
			return 600;
		} else if (marketTrader._quoteCurrency == 'BTC') {
			return 0.005;
		}
	}

	/**
	 * Method to overload: When we bought something, we are posting bid to sell it for (boughtPrice * (100+getExpectedGrowthPercent)/100);
	 * @param  {Number} boughtAtPriceValue Value of price when we bought
	 * @return {Number}                    Expected growth percent
	 */
	async getExpectedGrowthPercent(boughtAtPriceValue) {
		const marketTrader = this.getMarketTrader();

		return 5;
	}

	/**
	 * Method to overload: Amount to be spent for new bidworker to be scheduled
	 * @param  {Number} targetPriceValue price value of bidworker to target to buy at
	 * @return {Number}                      Max amount to be spent for new bidworker
	 */
	async getMaxBid(targetPriceValue) {
		const marketTrader = this.getMarketTrader();

		// console.error('marketTrader._quoteCurrency', marketTrader._quoteCurrency);

		if (marketTrader._quoteCurrency == 'USD') {
			return 5;
		} else if (marketTrader._quoteCurrency == 'BTC') {
			return 0.0001;
		}

		throw new Error('Don not know what to do');
	}

	/**
	 * Method to overload. Run after every market price update, after all bidworkers done their job and lastRunPriceCombined updated
	 * @return {Boolean} return anything
	 */
	async processNewCombinedPrice() {
		const priceCombined = this.getLastRunPriceCombined();
		const marketTrader = this.getMarketTrader();
		const bidWorkers = this.getBidWorkers();

		let availableCurrency = await this.asyncGetAvailableCurrency();

		let maxBid = await this.getMaxBid(priceCombined.low);
		let possibleBuyBidsCount = Math.floor(availableCurrency / maxBid);
		let openBuyBidsCount = this.getOpenBuyBidsCount();

		for (let bidWorker of bidWorkers) {
			if (bidWorker.isWaitingForBuyLowerThan(priceCombined.low * 0.7)) {
				/// close bids if they are waiting to buy with too low price
				await marketTrader.archiveWaitingForBuyBidWorker(bidWorker);
			}
		}

		// let archivedCount = 0;
		// let keptCount = 0;
		// if (possibleBuyBidsCount <= 5 && openBuyBidsCount <= 10) {
		// 	for (let i = bidWorkers.length; i--;) {
		// 		let bidWorker = bidWorkers[i];

		// 		if (bidWorker.isWaitingForBuy()) {
		// 			if (keptCount <= 5) {
		// 				keptCount++;
		// 			} else {
		// 				let archived = await marketTrader.archiveWaitingForBuyBidWorker(bidWorker);
		// 				if (archived) {
		// 					archivedCount++;
		// 				}
		// 			}
		// 		}
		// 	}
		// }

		const intervalPast = await priceCombined.getInterval(this.INTERVALS.MIN15);
		const shiftsPast = await intervalPast.getShifts(3);

		if (shiftsPast[0] > -0.5 || shiftsPast[1] > -0.5) {
			// do not add any buy bids if price is rising in last 2 hours
			//
			return;
		}


		let minPriceDownPercent = 0.99;
		let priceDownPercentStep = 0.0001;
		let doNotAddIfThereReSamePriceInPercentInterval = 0.09;


		if (marketTrader._quoteCurrency == 'BTC') {
			doNotAddIfThereReSamePriceInPercentInterval = 0.2;
		}
		// let doNotAddIfThereReSamePriceInPercentInterval = 1.2;
		//

		// if (marketTrader._quoteCurrency == 'BTC') {
		// 	doNotAddIfThereReSamePriceInPercentInterval = 0.1;
		// }

		if (possibleBuyBidsCount <= 5) {
			minPriceDownPercent = 0.95;
		}
		if (possibleBuyBidsCount < 10) {
			doNotAddIfThereReSamePriceInPercentInterval *= 2;
		}
		if (possibleBuyBidsCount < 5) {
			doNotAddIfThereReSamePriceInPercentInterval *= 2;
		}


		let maxPriceDownsCount = 200;
		const priceTargets = [];

		for (let i = 0; i < maxPriceDownsCount; i++) {
			if (priceCombined.low * minPriceDownPercent > priceCombined.low * 0.75) {
				priceTargets.push(priceCombined.low * minPriceDownPercent);
				minPriceDownPercent -= priceDownPercentStep;
			}
		}


		for (let priceTarget of priceTargets) {
			availableCurrency = await this.asyncGetAvailableCurrency();
			possibleBuyBidsCount = Math.floor(availableCurrency / maxBid);

			if (possibleBuyBidsCount < 20) {
				doNotAddIfThereReSamePriceInPercentInterval *= 2;
			}
			if (possibleBuyBidsCount < 15) {
				doNotAddIfThereReSamePriceInPercentInterval *= 2;
			}
			if (possibleBuyBidsCount < 10) {
				doNotAddIfThereReSamePriceInPercentInterval *= 2;
			}
			if (possibleBuyBidsCount < 5) {
				doNotAddIfThereReSamePriceInPercentInterval *= 2;
			}
			if (possibleBuyBidsCount < 2) {
				doNotAddIfThereReSamePriceInPercentInterval *= 2;
			}

			if (!marketTrader.isThereBidWorkerInTargetPriceAt(priceTarget, doNotAddIfThereReSamePriceInPercentInterval)) {
				await marketTrader.addBidWorkerWaitingForBuyAt(priceTarget);
			}
		}
	}

};

module.exports = Strategy;