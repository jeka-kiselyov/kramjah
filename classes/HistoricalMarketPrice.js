
class HistoricalMarketPrice {
	constructor(params) {
		this._t = new Date(params.row.time);
		this._time = params.row.time;
		this._row = params.row;
		this._historicalMarket = params.historicalMarket;
	}

	isValid() {
		if (this.time == Number(this.time)) {
			return true;
		}
		return false;
	}

	get time() {
		return this._time;
	}

	get volume() {
		return this._row.volume;
	}
	get high() {
		return this._row.high;
	}
	get low() {
		return this._row.low;
	}
	get open() {
		return this._row.open;
	}
	get close() {
		return this._row.close;
	}

	get price() {
		return this._row.open;
	}

	async getCombinedPrice(interval) {
		// const fromTime = Math.floor(this.time / interval) * interval;
		// const toTime = fromTime + interval;

		return await this._historicalMarket.getCombinedPrice(this.time, interval);
	}
};

module.exports = HistoricalMarketPrice;