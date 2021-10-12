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
		return this.getTraderSetting('takeOutQuantity', 0);

		// const marketTrader = this.getMarketTrader();          // MarketTrader instance
		// const quantityIncrement = marketTrader._quantityIncrement;

		// // should be dividable by quantityIncrement
		// if (marketTrader.symbol == 'ETHUSD') {
		// 	return quantityIncrement;
		// }

		// return 0;
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

        let operatingBalance = this.getTraderSetting('operatingBalance', 0);

        if (!operatingBalance) {
	        if (marketTrader._quoteCurrency == 'USD' || marketTrader._quoteCurrency == 'USDT') {
	                return 800;
	        } else if (marketTrader._quoteCurrency == 'BTC') {
	                return 0.005;
	        }
        } else {
        	return operatingBalance;
        }
	}

	/**
	 * Increaase ExpectedGrowthPercent by step if sell may produce less than getMinimumProfitForASale value in profit
	 * @param  {[type]} boughtAtPriceValue [description]
	 * @return {[type]}                    [description]
	 */
	async getMinimumProfitForASale(boughtAtPriceValue) {
		const maxBid = await this.getMaxBid(boughtAtPriceValue);
		const marketTrader = this.getMarketTrader();          // MarketTrader instance

		// should be dividable by quantityIncrement
		if (marketTrader.symbol == 'ETHUSD' || marketTrader.symbol == 'ETHUSDT') {
			return 0.01;
		}
		if (marketTrader.symbol == 'ETHBTC') {
			return (maxBid / 100);
		}

		return (maxBid / 50);
	}

	/**
	 * Method to overload: When we bought something, we are posting bid to sell it for (boughtPrice * (100+getExpectedGrowthPercent)/100);
	 * @param  {Number} boughtAtPriceValue Value of price when we bought
	 * @return {Number}                    Expected growth percent
	 */
	async getExpectedGrowthPercent(boughtAtPriceValue) {
		const marketTrader = this.getMarketTrader();

		return 0.4; /// will be increased to get a profit of getMinimumProfitForASale() automatically
	}

	/**
	 * Method to overload: Amount to be spent for new bidworker to be scheduled
	 * @param  {Number} targetPriceValue price value of bidworker to target to buy at
	 * @return {Number}                      Max amount to be spent for new bidworker
	 */
	async getMaxBid(targetPriceValue) {
		const marketTrader = this.getMarketTrader();

        let maxBid = this.getTraderSetting('maxBid', 0);
        if (!maxBid) {
	        if (marketTrader._quoteCurrency == 'USD' || marketTrader._quoteCurrency == 'USDT') {
	                return 5;
	        } else if (marketTrader._quoteCurrency == 'BTC') {
	                return 0.0001;
	        }
        }

        if (maxBid) {
        	return maxBid;
        }

		throw new Error('Don not know what to do');
	}


	async snapTargetPriceTo(targetPriceValue) {
		const marketTrader = this.getMarketTrader();          // MarketTrader instance

        let snapPriceTo = this.getTraderSetting('snapPriceTo', null);
		return snapPriceTo;
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

		let kToCancel = 0.7;
		if (possibleBuyBidsCount < 20) {
			kToCancel = 0.8;
		}

		let maxPriceForBuyOrders = priceCombined.low * kToCancel;

		// console.log('Cancel if buy price higher then '+maxPriceForBuyOrders);

		for (let bidWorker of bidWorkers) {
			if (bidWorker.isWaitingForBuyLowerThan(maxPriceForBuyOrders)) {
				// console.log('cancelling');
				/// close bids if they are waiting to buy with too low price
				await marketTrader.archiveWaitingForBuyBidWorker(bidWorker);
			}
		}

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
		if (marketTrader.symbol == 'CHSBBTC') {
			doNotAddIfThereReSamePriceInPercentInterval = 0.4;
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


		// console.log(marketTrader.symbol);


		for (let priceTarget of priceTargets) {
			let snapPriceTo = await this.snapTargetPriceTo(priceTarget);
			if (snapPriceTo) {
				priceTarget = Math.floor(priceTarget / snapPriceTo) * snapPriceTo;
			}

			availableCurrency = await this.asyncGetAvailableCurrency();
			possibleBuyBidsCount = Math.floor(availableCurrency / maxBid);

			if (possibleBuyBidsCount < 20) {
				doNotAddIfThereReSamePriceInPercentInterval *= 1.7;
			}
			if (possibleBuyBidsCount < 15) {
				doNotAddIfThereReSamePriceInPercentInterval *= 1.7;
			}
			if (possibleBuyBidsCount < 10) {
				doNotAddIfThereReSamePriceInPercentInterval *= 1.7;
			}
			if (possibleBuyBidsCount < 5) {
				doNotAddIfThereReSamePriceInPercentInterval *= 1.7;
			}
			if (possibleBuyBidsCount < 2) {
				doNotAddIfThereReSamePriceInPercentInterval *= 1.7;
			}

			if (!marketTrader.isThereBidWorkerInTargetPriceAt(priceTarget, doNotAddIfThereReSamePriceInPercentInterval)) {
				await marketTrader.addBidWorkerWaitingForBuyAt(priceTarget);
			}
		}
	}

};

module.exports = Strategy;