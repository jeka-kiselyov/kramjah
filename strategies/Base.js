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

	getTraderSetting(name, defaultValue) {
		if (this._marketTrader && this._marketTrader.traderSetting && this._marketTrader.traderSetting[name] !== undefined) {
			return this._marketTrader.traderSetting[name];
		}
		return defaultValue;
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
	 * Increaase ExpectedGrowthPercent by step if sell may produce less than getMinimumProfitForASale value in profit
	 * @param  {[type]} boughtAtPriceValue [description]
	 * @return {[type]}                    [description]
	 */
	async getMinimumProfitForASale(boughtAtPriceValue) {
		const maxBid = await this.getMaxBid(boughtAtPriceValue);
		return (maxBid / 50);
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
	 * Snap target price to a fixed step. return 50; and it will place bids for 1600..1650..1700..1750 etc
	 * return null; and it will use general percent step
	 * @param  {[type]} targetPriceValue [description]
	 * @return {[type]}                  [description]
	 */
	async snapTargetPriceTo(targetPriceValue) {
		const marketTrader = this.getMarketTrader();          // MarketTrader instance

		return null;
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

		return 0;
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