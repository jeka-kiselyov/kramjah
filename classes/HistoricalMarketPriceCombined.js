const Pack = require('./Pack.js');
const HistoricalMarket = require('./HistoricalMarket.js');

const debug = require('./Debug.js')('HistoricalMarketPriceCombined');

class HistoricalMarketPriceCombined {
	constructor(params = {}) {
		// console.log('HistoricalMarketPriceCombined', params.prices.length);
		this._interval = params.interval;
		this._historicalMarket = params.historicalMarket;


		// this._price = null;
		this._open = null;
		this._close = null;
		this._high = null;
		this._low = null;
		this._volume = null;

		this._price = null;

		this._prices = null;

		this._time = params.time;

		if (!this._time) {
			throw new Error('Specify time in params');
		}

		if (params.prices && params.prices.length) {
			this.calcValues(params.prices);

			if (params.prices[0].constructor === HistoricalMarketPriceCombined) {
				// if it's not lower level price item - persist reference to lower levels items
				this._prices = params.prices;
			}
		}
	}

	toUint8Array() {
		const lowerPricesCount = (this._prices && this._prices.length) ? this._prices.length : 0;
		const lowerUint8Arrays = [];

		let totalLength = 0;
		if (lowerPricesCount) {
			for (let price of this._prices) {
				let lowerUint8Array = price.toUint8Array();
				lowerUint8Arrays.push( lowerUint8Array );
				totalLength += lowerUint8Array.length;
			}
		}

		totalLength += (4 * 2 + 8 * 5 + 8 * 1 + 1 * 1); // I * 2 + d * 5 + Q * 1 + B * 1
		const itemUint8Array = Uint8Array.from(Pack.pack('>IBdddddQI', [totalLength, lowerPricesCount, this._open, this._close, this._high, this._low, this._volume, this._time, this._interval]));
		// console.log(itemUint8Array);
		if (!lowerPricesCount) {
			return itemUint8Array;
		}


		// let totalLength = itemUint8Array.length;
		// for (let price of this._prices) {
		// 	let lowerUint8Array = price.toUint8Array();
		// 	lowerUint8Arrays.push( lowerUint8Array );
		// 	totalLength += lowerUint8Array.length;
		// }

		const ret = new Uint8Array(totalLength);
		let offset = 0;
		ret.set(itemUint8Array, 0);
		offset += itemUint8Array.length;

		for (let lowerUint8Array of lowerUint8Arrays) {
			ret.set(lowerUint8Array, offset);
			offset += lowerUint8Array.length;
		}

		return ret;
	}

	static fromUint8Array(uint8Array, assignToHistoricalMarket = null) {
		const unpacked = Pack.unpack('>IBdddddQI', uint8Array);

		const time = unpacked[7];

		const priceCombined = new HistoricalMarketPriceCombined({
				historicalMarket: assignToHistoricalMarket,
				time: time,
			});
		const totalLength = unpacked[0];
		const lowerPricesCount = unpacked[1];

		priceCombined._open = unpacked[2];
		priceCombined._close = unpacked[3];
		priceCombined._high = unpacked[4];
		priceCombined._low = unpacked[5];
		priceCombined._volume = unpacked[6];
		priceCombined._time = time;
		priceCombined._interval = unpacked[8];

		if (lowerPricesCount) {
			priceCombined._prices = [];

			let lowerPricesRead = 0;
			let offset = (4 * 2 + 8 * 5 + 8 * 1 + 1 * 1); // I * 3 + d * 5 + Q * 1 + B * 1
			do {
				const subarray = uint8Array.subarray(offset);
				const unpackedLength = Pack.unpack('>I', subarray)[0];
				let price = HistoricalMarketPriceCombined.fromUint8Array(subarray, assignToHistoricalMarket);
				lowerPricesRead++;
				offset+=unpackedLength;

				priceCombined._prices.push(price);
			} while(lowerPricesRead < lowerPricesCount);
		}

		if (assignToHistoricalMarket) {
			assignToHistoricalMarket.pushCombinedPriceToCache(priceCombined);
		}

		return priceCombined;
	}

	calcValues(prices) {
		// let c = 0;
		this._volume = 0;
		this._high = 0;
		this._low = Infinity;

		let total = 0;
		let totalN = 0;
		prices.forEach((x)=>{
			// c+=x.price;
			this._volume += x.volume;
			total += x.price;
			totalN++;

			if (x.high > this._high) this._high = x.high;
			if (x.low < this._low) this._low = x.low;
		});

		if (totalN) {
			this._price = total / totalN;
		} else {
			this._price = null;
		}

		this._open = prices[0].open;
		this._close = prices[prices.length - 1].close;
		// this._price = c / prices.length;
	}

	setPriceDirectly(priceValue) {
		this._price = priceValue ? priceValue : null;
	}

	reCalcValues() {
		// if (this._time == 1614211200000) {
		// 	console.log(this._prices);
		// }
		return this.calcValues(this._prices);
	}

	get time() {
		return this._time;
	}

	get interval() {
		return this._interval;
	}

	get price() {
		if (this._price !== null) {
			return this._price;
		} else {
			return (this._high + this._low) / 2;
		}
	}

	get volume() {
		return this._volume;
	}

	get high() {
		return this._high;
	}
	get low() {
		return this._low;
	}
	get open() {
		return this._open;
	}
	get close() {
		return this._close;
	}

	async getPrev() {
		return await this._historicalMarket.getCombinedPrice(this.time - this.interval, this.interval);
	}

	async getNext() {
		return await this._historicalMarket.getCombinedPrice(this.time + this.interval, this.interval);
	}

	async getInterval(interval) {
		return await this._historicalMarket.getCombinedPrice(this.time, interval);
	}

	async getHigherInterval() {
		const intervalIndex = this._historicalMarket.RAWINTERVALS.indexOf(this.interval);
		if (this._historicalMarket.RAWINTERVALS.length < intervalIndex + 2) {
			return null;
		}
		const higherInterval = this._historicalMarket.RAWINTERVALS[intervalIndex + 1];
		return await this.getInterval(higherInterval);
	}

	isFull() {
		const intervalIndex = this._historicalMarket.RAWINTERVALS.indexOf(this.interval);
		if (intervalIndex == 0) {
			// lowest interval is always full
			return true;
		}

		const lowerInterval = this._historicalMarket.RAWINTERVALS[intervalIndex - 1];
		const thereShouldBeNPrices = Math.floor(this.interval / lowerInterval);

		if (this._prices.length != thereShouldBeNPrices) {
			// there're not full set of lower interval prices
			console.error('should be '+thereShouldBeNPrices+' but there '+this._prices.length);
			// console.error(this._prices[0]._prices[0]._prices[0]._prices[0]._prices[0]._prices[0]._prices[0]);
			return false;
		}

		for (let price of this._prices) {
			if (!price.isFull()) {
				return false;
			}
		}

		return true;
	}

	async mergeUpdatedChild(priceCombined) {
		let thereAlready = false;
		for (let price of this._prices) {
			if (price == priceCombined) {
				thereAlready = true;
			}
		}

		if (!thereAlready) {
			debug('Updating outdated priceCombined');

			// remove one with same time if any
			let iToRemove = null;
			for (let i = 0; i < this._prices.length; i++) {
				if (this._prices[i].time == priceCombined.time) {
					iToRemove = i;
				}
			}

			if (iToRemove !== null) {
				debug('Removing outdated priceCombined %p', this._prices[iToRemove]);
				this._prices.splice(iToRemove, 1);
			}
			// add new
			this._prices.push(priceCombined);

			return true;
		}

		return false;
	}

	async getShifts(maxShifts = 20) {
		const shifts = [];
		const thisPriceValue = this.price;
		let curShift = 0;
		let prevPrice = null;
		try {
			prevPrice = await this.getPrev();
		} catch(e) {
			prevPrice = null;
		}
		do {
			try {
				const prevPriceValue = prevPrice.price;
				const shift = ((thisPriceValue/prevPriceValue)-1)*100;
				shifts.push(shift);
			} catch(e) {
				shifts.push(0);
			}

			try {
				prevPrice = await prevPrice.getPrev();
			} catch(e) {
				prevPrice = null;
			}
			curShift++;
		} while(curShift <= maxShifts);

		return shifts;
	}
};

module.exports = HistoricalMarketPriceCombined;