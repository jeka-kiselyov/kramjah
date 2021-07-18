const EventEmitter = require('events');
const Notificator = require('./Notificator.js');
const MarketClosedBid = require('./MarketClosedBid.js');

class MarketTraderBidWorker extends EventEmitter {
	constructor(params = {}) {
		super();

		this._marketTrader = params.marketTrader;

		this._quantityIncrement = params.quantityIncrement; // // Symbol quantity should be divided by this value with no remainder
		this._tickSize = params.tickSize; // // Symbol price should be divided by this value with no remainder

		this._makerFeePercents = params.makerFeePercents;

		this._tradingApi = params.tradingApi;

		this._isArchived = false; // traded, not needed anymore
		this._waitingForBuy = false;
		this._gonnaBuy = null;

		this._waitingForSell = false;
		this._waitingForPrice = null;

		this._expectGrowthByPercent = null;

		this._originalTargetPrice = null;

		this._balances = [0,0];
		this._operatingBalance = 0;

		this._lastOrderClientOrderId = null;

		this._closedBids = [];
	}

	log(...fArgs) {
		if (this._marketTrader && this._marketTrader._logger) {
			this._marketTrader._logger.info.apply(this._marketTrader._logger, fArgs);
		}
	}

	isArchived() {
		return this._isArchived;
	}

	get strategy() {
		return this._marketTrader._strategy;
	}

	get symbol() {
		return this._marketTrader._symbol;
	}

	get mode() {
		return this._marketTrader._mode;
	}

	get operatingBalance() {
		return this._operatingBalance;
	}

	get gonnaPay () {
		return this._gonnaPay;
	}

	isWaitingForBuy() {
		if (this._waitingForBuy) {
			return true;
		}
		return false;
	}

	isWaitingForSell() {
		if (this._waitingForSell) {
			return true;
		}
		return false;
	}

	async archiveWaitingForBuy() {
		if (!this.isWaitingForBuy()) {
			return false;
		}

		this._waitingForBuy = false;
		this._isArchived = true;

		if (this._lastOrderClientOrderId) {
			await this._tradingApi.cancelOrder({
					clientOrderId: this._lastOrderClientOrderId,
				});
			this._lastOrderClientOrderId = true;
		}

		return true;
	}

	setOperatingBalance(value) {
		this._operatingBalance = value;
		this._balances[0] = value;
	}

	isWaitingForBuyLowerThan(price) {
		if (this._waitingForBuy) {
			if (this._waitingForPrice < price) {
				return true;
			}
		}
		return false;
	}

	originalTargetPriceIsIn(price, plusMinusPercents) {
		if (this._originalTargetPrice > price*(1-(plusMinusPercents / 100)) && this._originalTargetPrice < price*(1+(plusMinusPercents / 100))) {
			return true;
		}
		return false;
	}

	isWaitingForBuyAt(price, plusMinusPercents) {
		if (this._waitingForBuy) {
			if (this._waitingForPrice > price*(1-(plusMinusPercents / 100)) && this._waitingForPrice < price*(1+(plusMinusPercents / 100))) {
				return true;
			}
		}
		return false;
	}

	wasBoughtAt(price, plusMinusPercents) {
		if (this._waitingForSell) {
			if (this._originalTargetPrice > price*(1-(plusMinusPercents / 100)) && this._originalTargetPrice < price*(1+(plusMinusPercents / 100))) {
				return true;
			}
		}
		return false;
	}

	generateClientOrderId() {
		let priceAsString = this._originalTargetPrice.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));
		// return (''+this._originalTargetPrice+'_'+this._marketTrader.getClientOrderIdSuffix()+'_'+(new Date).getTime());
		return (''+priceAsString+'_'+this._marketTrader.getClientOrderIdSuffix()+'_'+((''+Math.random()).substring(2,8)));
	}

	async waitForBuyAt(price) {
		if (this._isArchived) {
			throw new Error('_isArchived');
		}
		if (this._waitingForSell) {
			throw new Error('_waitingForSell');
		}

		if (this._waitingForBuy) {
			throw new Error('Implement canceling and reopen first');
		}

		this._waitingForBuy = true;
		this._waitingForPrice = price;
		this._originalTargetPrice = price;


		const willTakeFee = this._operatingBalance * (this._makerFeePercents / 100);
		this._gonnaBuy = (this._operatingBalance - willTakeFee) / this._waitingForPrice;


		// console.log(this._gonnaBuy);

		this._gonnaBuy = Math.ceil(this._gonnaBuy * (1/this._quantityIncrement)) / (1/this._quantityIncrement);

		this._gonnaPay = this._gonnaBuy * this._waitingForPrice;
		this._gonnaPay += this._gonnaPay * (this._makerFeePercents / 100);

		// console.log(this._gonnaBuy);
		// console.log(this._gonnaPay);

		while(this._gonnaPay > this._operatingBalance) {
			this._gonnaBuy -= this._quantityIncrement;
			this._gonnaPay = this._gonnaBuy * this._waitingForPrice;
			this._gonnaPay += this._gonnaPay * (this._makerFeePercents / 100);
		};

		// console.log(this._gonnaBuy);
		// console.log(this._gonnaBuy.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))));


		if (this.mode == 'market') {
			this._lastOrderClientOrderId = this.generateClientOrderId();
			// console.log(this._lastOrderClientOrderId);

			let quantityToApi = this._gonnaBuy.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))); // love js? Trick to get rid of extra 0.0...0000001
			let priceToApi = this._waitingForPrice.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));

			this._gonnaBuy = parseFloat(quantityToApi, 10); // just double check value is correct

			await this._tradingApi.placeBuyOrder({
				clientOrderId: this._lastOrderClientOrderId,
				symbol: this.symbol,
				quantity: quantityToApi,
				price: priceToApi,
			});
		} else {
			// adjust in a same way as for simulation
			let quantityToApi = this._gonnaBuy.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))); // love js? Trick to get rid of extra 0.0...0000001
			// console.log(quantityToApi);
			this._gonnaBuy = parseFloat(quantityToApi, 10); // just double check value is correct


		}
	}

	async changeExpectedGrowthPercent(newPercent) {
		if (!this._waitingForSell || this._isArchived) {
			return false;
		}

		if (newPercent == this._expectGrowthByPercent) {
			return true;
		}

		this._expectGrowthByPercent = newPercent;
		let sellTargetPrice = (this._originalTargetPrice * (1+newPercent / 100));

		if (this._lastRunPriceCombined && sellTargetPrice < this._lastRunPriceCombined.price) {
			sellTargetPrice = this._lastRunPriceCombined.price;
		}

		this._waitingForPrice = sellTargetPrice;

		// @todo: update on market if mode == market
	}

	async waitForSellAt(price) {
		if (this._isArchived) {
			throw new Error('_isArchived');
		}
		if (this._waitingForBuy) {
			throw new Error('_waitingForBuy');
		}
		if (this._waitingForSell) {
			throw new Error('Implement canceling and reopen first');
		}

		this._waitingForSell = true;
		this._waitingForPrice = price;

		const gonnaSell = this._balances[1];
		this._gonnaSell = gonnaSell;

		if (this.mode == 'market') {
			this._lastOrderClientOrderId = this.generateClientOrderId();

			let quantityToApi = gonnaSell.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))); // love js? Trick to get rid of extra 0.0...0000001
			let priceToApi = this._waitingForPrice.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));


			await this._tradingApi.placeSellOrder({
				clientOrderId: this._lastOrderClientOrderId,
				symbol: this.symbol,
				quantity: quantityToApi,
				price: priceToApi,
			});
		}
	}

	async takeOutCoin(quantityToTakeOut) {
		if ((this._balances[1] - quantityToTakeOut) < 0) {
			throw new Error('Trying to took too much coins');
		}

		this._balances[1] -= quantityToTakeOut;

		if (this.mode == 'market') {
			let amountToApi = quantityToTakeOut.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement))));

			// @todo: check if successful
			let success = await this._tradingApi.transferFromTradingBalance({
				amount: amountToApi,
				currency: this._marketTrader._baseCurrency,
			});

			if (success) {
				await Notificator.log('💰 +' + amountToApi + '(' + this._marketTrader._baseCurrency + ')' +this._marketTrader._quoteCurrency +' from ' + this._marketTrader._baseCurrency + '  /chart_'+this._marketTrader._baseCurrency+'_'+this._marketTrader._quoteCurrency);
			}
		}
	}

	async takeOutProfit(value) {
		if ((this._balances[0] - value) < 0) {
			throw new Error('Trying to took too much');
		}
		this._balances[0]-=value;



		if (this.mode == 'market') {
			let amountToApi = value.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));

			// @todo: check if successful
			let success = await this._tradingApi.transferFromTradingBalance({
				amount: amountToApi,
				currency: this._marketTrader._quoteCurrency,
			});

			if (success) {
				await Notificator.log('💰 +' + amountToApi + this._marketTrader._quoteCurrency +' from ' + this._marketTrader._baseCurrency + '  /chart_'+this._marketTrader._baseCurrency+'_'+this._marketTrader._quoteCurrency);
			}
		}

		return true;
	}

	async wasBought(orderOnMarket, resellAtPrice) {
		let boughtAtPrice = this._waitingForPrice;
		let amount = this._gonnaBuy;

		if (orderOnMarket) {
			if (orderOnMarket.price) {
				boughtAtPrice = parseFloat(orderOnMarket.price, 10);
			}
			if (orderOnMarket.quantity) {
				amount = parseFloat(orderOnMarket.quantity, 10);
			}

			this._gonnaPay = boughtAtPrice * amount;
		}

		this._boughtAtPrice = boughtAtPrice;

		const expectGrowthByPercent = await this.strategy.getExpectedGrowthPercent(boughtAtPrice);

		this._balances[1] = amount;
		this._balances[0] = 0;

		this._waitingForBuy = false;
		this._lastOrderClientOrderId = null;

		this._expectGrowthByPercent = expectGrowthByPercent;
		let sellTargetPrice = (this._waitingForPrice * (1+expectGrowthByPercent / 100));
		if (resellAtPrice) {
			sellTargetPrice = resellAtPrice;
		}

		this.emit('bought', boughtAtPrice, amount);

		if (this.strategy.getTakeOutQuantityBeforeSell) {
			const takeOutQuantityBeforeSell = await this.strategy.getTakeOutQuantityBeforeSell();

			if (takeOutQuantityBeforeSell > 0) {
				try {
					await this.takeOutCoin(takeOutQuantityBeforeSell);
				} catch(e) {
					// console.log(e);

				}
			}
		}

		const closedBid = new MarketClosedBid({
			atPrice: boughtAtPrice,
			isBought: true,
			amount: amount,
		});
		this._closedBids.unshift(closedBid);
		this._marketTrader._closedBids.unshift(closedBid);

		let goingToSellAndGet = sellTargetPrice * this._balances[1]  * (1 - (this._makerFeePercents / 100)); // check if we are going to make more after sell (with respect for takeOutQuantityBeforeSell)
		let minimumProfitForASale = 0;
		try {
			minimumProfitForASale = await this.strategy.getMinimumProfitForASale(boughtAtPrice);
		} catch(e) {
			minimumProfitForASale = 0;
		}

		while (goingToSellAndGet - minimumProfitForASale <= this._gonnaPay) {
			this._expectGrowthByPercent = this._expectGrowthByPercent + 0.1;
			sellTargetPrice = (this._waitingForPrice * (1+this._expectGrowthByPercent / 100));
			goingToSellAndGet = sellTargetPrice * this._balances[1]  * (1 - (this._makerFeePercents / 100));
		}

		await this.waitForSellAt(sellTargetPrice);
	}

	async wasSold(orderOnMarket) {
		const soldAtPrice = this._waitingForPrice;
		let amount = this._balances[1];

		if (orderOnMarket && orderOnMarket.amount) {
			amount = parseFloat(orderOnMarket.amount, 10);
		}

		const soldFor = (this._waitingForPrice*amount) * (1 - (this._makerFeePercents / 100));

		this._balances[0]+= soldFor;
		this._balances[1] = 0;

		const madeProfitOf = soldFor - this._gonnaPay;

		this.emit('sold', soldAtPrice, amount, madeProfitOf);

		const closedBid = new MarketClosedBid({
			atPrice: soldAtPrice,
			profit: madeProfitOf,
			isBought: false,
			amount: amount,
		});
		this._closedBids.unshift(closedBid);
		this._marketTrader._closedBids.unshift(closedBid);

		try {
			await this.takeOutProfit(madeProfitOf);
		} catch(e) {

		}

		this._waitingForSell = false;
		this._lastOrderClientOrderId = null;

		await this.waitForBuyAt(this._originalTargetPrice);
	}

	async processTradingApiTick() {
		if (!this._lastOrderClientOrderId) {
			return false;
		}

		let orderOnMarket = null;

		try {
			orderOnMarket = await this._tradingApi.getOrderByClientOrderIdWithCache({
				symbol: this.symbol,
				clientOrderId: this._lastOrderClientOrderId,
			});
		} catch(e) {
			orderOnMarket = null;
		}
		// console.log(orderOnMarket.status);

		if (!orderOnMarket) {
			// console.error('Can not find order on market', this._lastOrderClientOrderId);

			return false;
		}

		if (orderOnMarket.status == 'filled') {
			if (this._waitingForBuy) {
				this._gonnaBuy = parseFloat(orderOnMarket.cumQuantity, 10);
				await this.wasBought(orderOnMarket);
			} else if (this._waitingForSell) {
				await this.wasSold(orderOnMarket);
			}
		}
	}

	async processNewCombinedPrice(priceCombined) {
		if (this._isArchived) {
			return;
		}
		if (this.mode != 'simulation') {
			// we are marking bids as bought sold based on price in simulation mode only.
			// on real market trade, we are using function
			await this.processTradingApiTick();

			return;
		} else if (this.mode == 'simulation') {

			if (this._waitingForBuy) {
				if (priceCombined.low <= this._waitingForPrice) {
					// we've bought
					await this.wasBought();
				}
			} else if (this._waitingForSell) {
				if (priceCombined.high >= this._waitingForPrice) {
					// we've sold
					await this.wasSold();
				}
			}

			this._lastRunPriceCombined = priceCombined;

			return;
		}

	}

	getHistoricalProfit() {
		let profit = 0;
		for (let i = 0; i < this._closedBids.length; i++) {
			if (this._closedBids[i].profit) {
				profit += this._closedBids[i].profit;
			}
		}

		return profit;
	}

	/**
	 * Append history filled order. Should be added from most recent to the oldest one, by one
	 * @param  {[type]} marketOrder [description]
	 * @return {[type]}             [description]
	 */
	appendHistoryClosedBidOrder(marketOrder) {
		if (!marketOrder.status || marketOrder.status != 'filled') {
			return false;
		}

		const price = parseFloat(marketOrder.price, 10);
		const amount = parseFloat(marketOrder.quantity, 10);

		let isBought = false;
		if (marketOrder.side == 'buy') {
			isBought = true;
		}

		const closedBid = new MarketClosedBid({
			atPrice: price,
			isBought: isBought,
			amount: amount,
		});

		if (isBought) {
			// is this is 'buy' filled order, lets calculate the profit 'sell' one (added just before) made
			if (this._closedBids[0] && this._closedBids[0].isSold()) {
				// console.log('calculating profit for previous');
				let thisTotal = closedBid.total;
				let soldTotal = this._closedBids[0].total;

				let profit = soldTotal - thisTotal;

				// console.log('profit', profit, thisTotal, soldTotal, amount);
				this._closedBids[0]._profit = profit;
			}
		}

		this._closedBids.unshift(closedBid);
	}
};

module.exports = MarketTraderBidWorker;