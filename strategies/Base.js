const HistoricalMarket = require('../classes/HistoricalMarket.js');

class Base {
	constructor(params = {}) {
		this._marketTrader = params.marketTrader;
		this._strategyName = params.strategyName;

		if (!this._marketTrader) {
			throw new Error('Strategy can not work without marketTrader');
		}

		this.INTERVALS = HistoricalMarket.INTERVALS;
	}

	static getStrategy(name, marketTrader) {
		try {
			const Class = require('./'+name+'.js');
			return new Class({
					marketTrader: marketTrader,
					strategyName: name,
				});
		} catch(e) {
			return null;
		}
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
		return 3;
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
		const priceCombined = this.getLastRunPriceCombined(); // Instance of the most recent HistoricalMarketPriceCombined 5 min interval
		const marketTrader = this.getMarketTrader();          // MarketTrader instance
		const bidWorkers = this.getBidWorkers();              // Active and archived bidworkers
		const operatingBalance = this.getOperatingBalance();  // Amount of quote currency available (USD when you trade for BTCUSD).
		const availableCurrency = await this.asyncGetAvailableCurrency();
		//
		// Do anything with them
		//
	}

	async asyncGetAvailableCurrency() {
		return this._marketTrader.getAvailableCurrency();
	}

	getOpenBuyBidsCount() {
		return this._marketTrader.getOpenBuyBidsCount();
	}

	getLastRunPriceCombined() {
		return this._marketTrader._lastRunPriceCombined;
	}

	getMarketTrader() {
		return this._marketTrader;
	}

	getBidWorkers() {
		return this._marketTrader._bidWorkers;
	}

	getOperatingBalance() {
		return this._marketTrader.operatingBalance;
	}
};

module.exports = Base;