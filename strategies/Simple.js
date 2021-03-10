const Base = require('./Base.js');

class Strategy extends Base {
	constructor(params) {
		super(params);
	}

	/**
	 * Method to overload: On initialization we determine how much money is available for this strategy to trade with
	 * totalQuoteCurrencyBalance is the total amount available in quote currency (USD when trading on BTCUSD) on your trading account
	 * return all totalQuoteCurrencyBalance or part of it
	 * @param  {Number} totalQuoteCurrencyBalance [description]
	 * @return {Number}                           [description]
	 */
	async getMaxOperatingBalance(totalQuoteCurrencyBalance) {
		return totalQuoteCurrencyBalance;
	}

	/**
	 * Method to overload: When we bought something, we are posting bid to sell it for (boughtPrice * (100+getExpectedGrowthPercent)/100);
	 * @param  {Number} boughtAtPriceValue Value of price when we bought
	 * @return {Number}                    Expected growth percent
	 */
	async getExpectedGrowthPercent(boughtAtPriceValue) {
		return 2.4;
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
		let operatingBalance = this.getOperatingBalance();

		for (let bidWorker of bidWorkers) {
			if (bidWorker.isWaitingForBuyLowerThan(priceCombined.low * 0.7)) {
				/// close bids if they are waiting to buy with too low price
				await marketTrader.archiveWaitingForBuyBidWorker(bidWorker);
			}
			if (operatingBalance < 10) {
				if (bidWorker.isWaitingForBuyLowerThan(priceCombined.low * 0.95)) {
					/// close bids if they are waiting to buy with too low price
					await marketTrader.archiveWaitingForBuyBidWorker(bidWorker);
				}
			}
		}

		const intervalPast = await priceCombined.getInterval(this.INTERVALS.MIN15);
		const shiftsPast = await intervalPast.getShifts(3);

		if (shiftsPast[shiftsPast.length - 1] > -0.5 || shiftsPast[shiftsPast.length - 2] > -0.5) {
			// do not add any buy bids if price is rising in last 2 hours
			//
			return;
		}


		let minPriceDownPercent = 0.99;
		let priceDownPercentStep = 0.0001;
		let doNotAddIfThereReSamePriceInPercentInterval = 0.09;
		// let doNotAddIfThereReSamePriceInPercentInterval = 1.2;
		//

		let maxBid = await this.getMaxBid(priceCombined.low);

		let maxPriceDownsCount = 200;
		const priceTargets = [];

		for (let i = 0; i < maxPriceDownsCount; i++) {
			if (priceCombined.low * minPriceDownPercent > priceCombined.low * 0.75) {
				priceTargets.push(priceCombined.low * minPriceDownPercent);
				minPriceDownPercent -= priceDownPercentStep;
			}
		}

		for (let priceTarget of priceTargets) {
			if (!marketTrader.isThereBidWorkerInTargetPriceAt(priceTarget, doNotAddIfThereReSamePriceInPercentInterval)) {
				await marketTrader.addBidWorkerWaitingForBuyAt(priceTarget);
			}
		}
	}

};

module.exports = Strategy;