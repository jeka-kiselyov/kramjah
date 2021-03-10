const EventEmitter = require('events');

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

		this._originalTargetPrice = null;

		this._balances = [0,0];
		this._operatingBalance = 0;

		this._lastOrderClientOrderId = null;
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
		this._gonnaBuy = Math.round(this._gonnaBuy * (1/this._quantityIncrement)) / (1/this._quantityIncrement);

		this._gonnaPay = this._gonnaBuy * this._waitingForPrice;
		this._gonnaPay += this._gonnaPay * (this._makerFeePercents / 100);

		while(this._gonnaPay > this._operatingBalance) {
			this._gonnaBuy -= this._quantityIncrement;
			this._gonnaPay = this._gonnaBuy * this._waitingForPrice;
			this._gonnaPay += this._gonnaPay * (this._makerFeePercents / 100);
		};

		if (this.mode == 'market') {
			this._lastOrderClientOrderId = this.generateClientOrderId();
			// console.log(this._lastOrderClientOrderId);

			let quantityToApi = this._gonnaBuy.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))); // love js? Trick to get rid of extra 0.0...0000001
			let priceToApi = this._waitingForPrice.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));

			await this._tradingApi.placeBuyOrder({
				clientOrderId: this._lastOrderClientOrderId,
				symbol: this.symbol,
				quantity: quantityToApi,
				price: priceToApi,
			});
		}
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

	async takeOutProfit(value) {
		if ((this._balances[0] - value) < 0) {
			throw new Error('Trying to took too much');
		}
		this._balances[0]-=value;

		if (this.mode == 'market') {
			let amountToApi = value.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize))));

			// @todo: check if successful
			await this._tradingApi.transferFromTradingBalance({
				amount: amountToApi,
				currency: this._marketTrader._quoteCurrency,
			});
		}

		return true;
	}

	async wasBought(resellAtPrice) {
		const boughtAtPrice = this._waitingForPrice;
		const expectGrowthByPercent = await this.strategy.getExpectedGrowthPercent(boughtAtPrice);
		const amount = this._gonnaBuy;

		this._balances[1]+= amount;
		this._balances[0]-= this._gonnaPay;
		this._waitingForBuy = false;
		this._lastOrderClientOrderId = null;

		let sellTargetPrice = (this._waitingForPrice * (1+expectGrowthByPercent / 100));
		if (resellAtPrice) {
			sellTargetPrice = resellAtPrice;
		}

		this.emit('bought', boughtAtPrice, amount);

		await this.waitForSellAt(sellTargetPrice);
	}

	async wasSold() {
		const soldAtPrice = this._waitingForPrice;
		const amount = this._balances[1];
		const soldFor = (this._waitingForPrice*amount) * (1 - (this._makerFeePercents / 100));

		this._balances[0]+= soldFor;
		this._balances[1] = 0;

		const madeProfitOf = soldFor - this._gonnaPay;

		this.emit('sold', soldAtPrice, amount, madeProfitOf);

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
				await this.wasBought();
			} else if (this._waitingForSell) {
				await this.wasSold();
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

			return;
		}

	}
};

module.exports = MarketTraderBidWorker;