const Base = require('./Base.js');

class Strategy extends Base {
	constructor(params) {
		super(params);
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
		return 5;
	}

	/**
	 * Method to overload. Run after every market price update, after all bidworkers done their job and lastRunPriceCombined updated
	 * @return {Boolean} return anything
	 */
	async processNewCombinedPrice() {
		const priceCombined = this.getLastRunPriceCombined();
		const marketTrader = this.getMarketTrader();
		const bidWorkers = this.getBidWorkers();
		const operatingBalance = this.getOperatingBalance();

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

		const intervalHOUR1 = await priceCombined.getInterval(this.INTERVALS.HOUR1);
		const shiftsHOUR1 = await intervalHOUR1.getShifts(3);

		if (shiftsHOUR1[shiftsHOUR1.lenght - 1] > -1 || shiftsHOUR1[shiftsHOUR1.lenght - 2] > -1) {
			// do not add any buy bids if price is rising in last 2 hours
			return;
		}


		let minPriceDownPercent = 0.99;
		let priceDownPercentStep = 0.001;
		let doNotAddIfThereReSamePriceInPercentInterval = 0.2;
		// let doNotAddIfThereReSamePriceInPercentInterval = 1.2;
		let maxPriceDownsCount = 20;
		const priceTargets = [];

		for (let i = 0; i < maxPriceDownsCount; i++) {
			priceTargets.push(priceCombined.low * minPriceDownPercent);
			minPriceDownPercent -= priceDownPercentStep;
		}

		for (let priceTarget of priceTargets) {
			if (!marketTrader.isThereBidWorkerInTargetPriceAt(priceTarget, doNotAddIfThereReSamePriceInPercentInterval)) {
				await marketTrader.addBidWorkerWaitingForBuyAt(priceTarget);
			}
		}
	}

};

module.exports = Strategy;