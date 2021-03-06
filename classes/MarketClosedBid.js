

class MarketClosedBid {
	constructor(params = {}) {
		this._atPrice = params.atPrice;
		this._priceCombined = params.priceCombined;
		this._isBought = !!params.isBought;
		this._isSold = !params.isBought;

		this._profit = params.profit || 0;
	}

	get atPrice() {
		return this._atPrice;
	}

	get profit() {
		return this._profit;
	}

	isBought() {
		return this._isBought;
	}

	isSold() {
		return this._isSold;
	}
};

module.exports = MarketClosedBid;