const axios = require('axios');
const moment = require('moment');

class RealMarketData {
	constructor(params = {}) {
		this._api = axios.create({
			baseURL: 'https://api.hitbtc.com/api/2/public/',
			timeout: 10000,
			headers: {'X-Custom-Header': 'foobar'}
		});
	}

	async getAllSymbols() {
		let url = 'symbol';

		let resp = null;
		try {
			resp = await this._api.get(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data && resp.data.length) {
			return resp.data;
		}

		return null;
	}

	async getSymbolInfo(symbol) {
		symbol = (''+symbol).toUpperCase();
		let url = 'symbol/'+symbol+'';

		let resp = null;
		try {
			resp = await this._api.get(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data && resp.data.id == symbol) {
			return resp.data;
		}

		return null;
	}

	async getTicker(symbol) {
		symbol = (''+symbol).toUpperCase();
		let url = 'ticker?symbols='+symbol+'';

		let resp = null;
		try {
			resp = await this._api.get(url);
		} catch(e) {
			return null;
		}

		if (resp && resp.data && resp.data[0] && resp.data[0].symbol == symbol) {
			let row = resp.data[0];
			return {
				time: moment(row.timestamp).valueOf(),
				low: parseFloat(row.bid, 10),
				high: parseFloat(row.ask, 10),
				open: parseFloat(row.open, 10),
				close: parseFloat(row.open, 10),
				volume: parseFloat(row.volume, 10),
				price: parseFloat(row.bid, 10),
			}
		}

		return null;
	}

    async getLastD1Candle(symbol) {
        symbol = (''+symbol).toUpperCase();

        let fromTimeISO = moment().subtract(1, 'day').startOf('day').toISOString();
        let toTimeISO = moment().endOf('day').toISOString();

        let url = 'candles?symbols='+symbol+'&period=d1&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1';

        let resp = await this._api.get(url);

        try {

            if (resp && resp.data && resp.data[symbol]) {
                return resp.data[symbol].map((row)=>{
                    return {
                        time: moment(row.timestamp).valueOf(),
                        low: parseFloat(row.min, 10),
                        high: parseFloat(row.max, 10),
                        open: parseFloat(row.open, 10),
                        close: parseFloat(row.close, 10),
                        volume: parseFloat(row.volume, 10),
                        volumeQuote: parseFloat(row.volumeQuote, 10),
                    };
                })[0];
            }

        } catch(e) {}

        return {};
    }

	async getM5Candles(symbol, fromTime, toTime) {
		symbol = (''+symbol).toUpperCase();

		// symbol = BTCUSD
		let fromTimeISO = moment(fromTime).toISOString();
		let toTimeISO = moment(toTime).toISOString();

		let url = 'candles?symbols='+symbol+'&period=m5&from='+fromTimeISO+'&till='+toTimeISO+'&limit=1000';

		// console.log(url);

		let resp = await this._api.get(url);

		// console.log(data);

		if (resp && resp.data && resp.data[symbol]) {
			return resp.data[symbol].map((row)=>{
				return {
					time: moment(row.timestamp).valueOf(),
					low: parseFloat(row.min, 10),
					high: parseFloat(row.max, 10),
					open: parseFloat(row.open, 10),
					close: parseFloat(row.close, 10),
					volume: parseFloat(row.volume, 10),
					volumeQuote: parseFloat(row.volumeQuote, 10),
				};
			});
		}

		return [];
	}

	async evaluateSymbol(symbol) {
		const expectedPercentGrowth = 2.5;
		const pricesBidIntervalPercents = 0.09;

        const symbolInfo = await this.getSymbolInfo(symbol);

        let toTime = (new Date()).getTime();
        let fromTime = (new Date()).getTime();

        fromTime  -= 7*24*60*60*1000; // move for one top level interval to the past to be sure we cover gaps

        let priceOnStart = null;
        let priceOnEnd = null;
        let volatilities = [];

        let maxVolatility = 0;
        let minVolatility = Infinity;

        let pricesToSold = [];
        let pricesToSoldCovered = 0;

        let pricesToSoldInInterval = [];
        let pricesToSoldInIntervalCovered = 0;

        let volumes = [];

        while (fromTime < toTime) {
            let getTo = fromTime + 24 * 60 * 60 * 1000;
            let data = await this.getM5Candles(symbol, fromTime, getTo);

            data.sort(function(a, b) {
                return a.time - b.time;
            });

            let addedPricePoints = 0;
            for (let item of data) {
                if (priceOnStart === null) priceOnStart = (item.low + item.high) / 2;
                priceOnEnd = (item.low + item.high) / 2;

                let volatility = (Math.max(item.high, item.open, item.close) - Math.min(item.low, item.open, item.close)) / priceOnEnd;

                if (volatility > maxVolatility) maxVolatility = volatility;
                if (volatility < minVolatility) minVolatility = volatility;

                volatilities.push(volatility);

                volumes.push(item.volumeQuote);

                for (let i = 0; i < pricesToSold.length; i++) {
                    let priceToSold = pricesToSold[i];

                    if (priceOnEnd >= priceToSold) {
                        // covered
                        //
                        pricesToSold.splice(i, 1); i--;
                        pricesToSoldCovered++;
                    }
                }

                for (let i = 0; i < pricesToSoldInInterval.length; i++) {
                    let priceToSold = pricesToSoldInInterval[i];

                    if (priceOnEnd >= priceToSold) {
                        // covered
                        //
                        pricesToSoldInInterval.splice(i, 1); i--;
                        pricesToSoldInIntervalCovered++;
                    }
                }

                pricesToSold.push(priceOnEnd * ((100+expectedPercentGrowth)/100) );

                let foundInInterval = false;
                let thisToBeSoldAt = priceOnEnd * ((100+expectedPercentGrowth)/100);
                for (let priceToSoldInInterval of pricesToSoldInInterval) {
                	// let toSoldAt = priceToSoldInInterval * ((100+expectedPercentGrowth)/100);
                	if (thisToBeSoldAt >= (priceToSoldInInterval * (100-pricesBidIntervalPercents)/100) && thisToBeSoldAt <= (priceToSoldInInterval * (100+pricesBidIntervalPercents)/100)) {
                		foundInInterval = true;
                	}
                }

                if (!foundInInterval) {
	                pricesToSoldInInterval.push(thisToBeSoldAt);
                }
            }

            await new Promise((res)=>{ setTimeout(res, 500); });
            fromTime += 24 * 60 * 60 * 1000;
        }

        let sumVolatility = volatilities.reduce((a, b) => a + b, 0);
        let avgVolatility = (sumVolatility / volatilities.length) || 0;

        const asc = arr => arr.sort((a, b) => a - b);

        const sum = arr => arr.reduce((a, b) => a + b, 0);

        const mean = arr => sum(arr) / arr.length;
        // sample standard deviation
        const std = (arr) => {
            const mu = mean(arr);
            const diffArr = arr.map(a => (a - mu) ** 2);
            return Math.sqrt(sum(diffArr) / (arr.length - 1));
        };

        const quantile = (arr, q) => {
            const sorted = asc(arr);
            const pos = (sorted.length - 1) * q;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (sorted[base + 1] !== undefined) {
                return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
            } else {
                return sorted[base];
            }
        };

        let medianVolume = quantile(volumes, .50);
        let totalVolume = sum(volumes);

        let medianVolatility = quantile(volatilities, .50);
        let q25Volatility = quantile(volatilities, .25);
        let q75Volatility = quantile(volatilities, .75);

        let diff = (priceOnEnd - priceOnStart) / priceOnStart;

        let pricesToSoldOpen = pricesToSold.length;
        let pricesToSoldCoveredPercent = 1 - ( pricesToSoldOpen ? (pricesToSoldOpen / (pricesToSoldOpen + pricesToSoldCovered)) : 0 );
        let pricesToSoldInIntervalOpen = pricesToSoldInInterval.length;
        let pricesToSoldInIntervalCoveredPercent = 1 - ( pricesToSoldInIntervalOpen ? (pricesToSoldInIntervalOpen / (pricesToSoldInIntervalOpen + pricesToSoldInIntervalCovered)) : 0 );

        return {
        	symbol: symbolInfo.id,
        	baseCurrency: symbolInfo.baseCurrency,
        	quoteCurrency: symbolInfo.quoteCurrency,
        	priceOnStart: priceOnStart,
        	priceOnEnd: priceOnEnd,
        	medianVolume: medianVolume,
        	totalVolume: totalVolume,
        	pricesToSoldCovered: pricesToSoldCovered,
        	pricesToSoldOpen: pricesToSoldOpen,
        	pricesToSoldCoveredPercent: parseFloat((pricesToSoldCoveredPercent*100).toFixed(3)),
        	pricesToSoldInIntervalCovered: pricesToSoldInIntervalCovered,
        	pricesToSoldInIntervalOpen: pricesToSoldInIntervalOpen,
        	pricesToSoldInIntervalCoveredPercent: parseFloat((pricesToSoldInIntervalCoveredPercent*100).toFixed(3)),
        	diff: parseFloat((diff*100).toFixed(3)),
        	minVolatility: parseFloat((minVolatility*100).toFixed(3)),
        	avgVolatility: parseFloat((avgVolatility*100).toFixed(3)),
        	maxVolatility: parseFloat((maxVolatility*100).toFixed(3)),
        	q25Volatility: parseFloat((q25Volatility*100).toFixed(3)),
        	medianVolatility: parseFloat((medianVolatility*100).toFixed(3)),
        	q75Volatility: parseFloat((q75Volatility*100).toFixed(3)),
        };
	}
};

module.exports = RealMarketData;