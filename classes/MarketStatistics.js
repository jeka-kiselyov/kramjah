const Market = require('./markets/HitBtc.js');


// @todo: cache this._market.getAccountBalance(); and this._market.getTradingBalance();

class MarketStatistics {
	constructor(params = {}) {
        this._market = Market.getSingleton(false);

        // this._market = new TradingApi();
        // this._market = new RealMarketData();

        this._allSymbols = [];
        this._tickSizes = { /// need this to convert floats to readable numeric format
            'USD': 0.01,
        };
        this._symbolsPrepared = false; // set after await this.prepareSymbols();
	}

    async getOrdersDispersion(marketTrader) {
        await this.prepareSymbols();

        const intervalPriceOutK = 0.95;
        if (intervalPriceOutK >= 1 || intervalPriceOutK <= 0) {
            throw new Error('Invalid price interval K');
        }

        const curDate = new Date();

        const symbol = marketTrader._symbol;
        const strategyName = marketTrader._strategyName;

        const ticker = await this._market.getTicker(symbol);
        const currentPrice = ticker.low;

        let quoteCurrency = null;
        let baseCurrency = null;
        let tickSize = null;

        for (let marketSymbol of this._allSymbols) {
            if (marketSymbol.id == symbol) {
                quoteCurrency = marketSymbol.quoteCurrency;
                baseCurrency = marketSymbol.baseCurrency;
                tickSize = marketSymbol.tickSize;
            }
        }

        if (!quoteCurrency) {
            throw new Error('Can not get symbol info from market');
        }

        const importantOrders = await this._market.getRecentOrdersBySymbolAndStrategyName({
            symbol: symbol,
            strategyName: strategyName,
            outdatedToo: true,
            notOursToo: false,
        });

        let minSellPrice = Infinity;
        const prices = [];

        for (let order of importantOrders) {
            if (order.status == 'new' || order.status == 'filled') {
                const price = parseFloat(order.originalPrice);

                prices.push({
                    price: price,
                    side: order.side,
                });

                if (order.side == 'sell' && price < minSellPrice) {
                    minSellPrice = price;
                }
            }
        }

        prices.sort((a, b) => a.price - b.price);

        // console.log(importantOrders);

        const minPrice = prices[0].price;
        let maxPrice = prices[prices.length - 1].price;

        const intervals = [];

        maxPrice = parseFloat(maxPrice.toFixed(Math.ceil(Math.abs(Math.log10(tickSize))))) + parseFloat(tickSize); // increase max price by tickSize

        for (let intervalPrice = maxPrice; intervalPrice > minPrice; intervalPrice = intervalPrice * intervalPriceOutK) {

            let fromPrice = intervalPrice * intervalPriceOutK;
            let toPrice = intervalPrice;

            const interval = {
                isCurrent: false,
                minPrice: fromPrice, // >=
                maxPrice: toPrice,  // <
            };

            interval.minPriceAsString = this.priceToString(quoteCurrency, interval.minPrice);
            interval.maxPriceAsString = this.priceToString(quoteCurrency, interval.maxPrice);

            if (interval.minPrice < minSellPrice && interval.maxPrice < minSellPrice) {
            } else if (interval.minPrice > minSellPrice && interval.maxPrice > minSellPrice) {
            } else {
                // interval around current price
                interval.isCurrent = true;
            }

            interval.openOrders = {
                buy: 0,
                sell: 0,
            };
            interval.filledSoldOrders = 0;
            interval.mostRecentFilledDate = null;
            interval.wasBoughtFor = 0;
            interval.wasSoldFor = 0;
            interval.itemToSell = 0;
            interval.spentForItem = 0;
            interval.baseCurrency = baseCurrency;
            interval.quoteCurrency = quoteCurrency;

            let hasOrders = false;

            const checkOrder = (order, isOlder)=>{
                const price = parseFloat(order.originalPrice);
                if (price >= interval.minPrice && price < interval.maxPrice) {
                    // in current interval
                    //
                    hasOrders = true;

                    if (order.status == 'new') {
                        if (order.side == 'sell') {
                            interval.openOrders.sell++;
                            interval.itemToSell += parseFloat(order.quantity);
                            interval.spentForItem += (order.originalPrice * order.quantity);
                        } else {
                            interval.openOrders.buy++;
                        }
                    } else if (order.status == 'filled') {
                        if (!interval.mostRecentFilledDate || interval.mostRecentFilledDate < order.createdAt) {
                            interval.mostRecentFilledDate = order.createdAt;
                        }
                        let amount = parseFloat(order.price) * parseFloat(order.cumQuantity);
                        if (order.side == 'sell') {
                            interval.wasSoldFor += amount;
                            interval.filledSoldOrders++;
                        } else {
                            interval.wasBoughtFor += amount;
                        }
                    }
                }

                if (order.previousOrders) {
                    for (let olderOrder of order.previousOrders) {
                        if (olderOrder.clientOrderId != order.clientOrderId) {
                            checkOrder(olderOrder, true);
                        }
                    }
                }
            };

            for (let order of importantOrders) {
                checkOrder(order);
            }

            if (interval.mostRecentFilledDate) {
                interval.daysSinceMostRecentFilled = Math.ceil( (Math.abs(curDate - interval.mostRecentFilledDate)) / (1000 * 60 * 60 * 24) );
            }

            interval.hadProfit = interval.wasSoldFor - interval.wasBoughtFor;
            interval.hadFilledProfit = interval.hadProfit + interval.spentForItem;

            interval.wouldGetIfSoldNow = interval.itemToSell * currentPrice;
            interval.expectedProfit = interval.hadProfit + interval.wouldGetIfSoldNow;

            interval.expectedProfitAsString = this.priceToString(quoteCurrency, interval.expectedProfit);
            interval.itemToSellAsString = this.priceToString(baseCurrency, interval.itemToSell);

            if (hasOrders) {
                intervals.push(interval);
            }
        }

        return intervals;
    }

    /**
     * Get account balance information
     * For all coins you have something in Main account
     *
     * optional paramets marketTraders - array of MarketTrader instances, adds toBeReserved property to results
     * with estimated amount of coin, marketTraders are going to use for trading
     *
     * Every returning property has 'asString' sibling. available - availableAsString etc
     * converted to tickSize - respected readable string
     *
     * Returns:
     *
     * { USD:
           { currency: 'USD',
             main: 71.58,
             mainAsString: '71.58',
             available: 799.312659977951,
             availableAsString: '799.31',
             reserved: 950.706562185305,
             reservedAsString: '950.71',
             toBeReserved: 730.312659977951,
             toBeReservedAsString: '730.31' },
          BTC:
           { currency: 'BTC',
             main: 0.00821236,
             mainAsString: '0.008212360',
             available: 0.008777160405,
             availableAsString: '0.008777160',
             reserved: 0.039387912821,
             reservedAsString: '0.039387913',
             toBeReserved: 0,
             toBeReservedAsString: '0.000000000' },
          ETH:
           { currency: 'ETH',
             main: 0.1181,
             mainAsString: '0.118100000',
             available: 0.0079,
             availableAsString: '0.007900000',
             reserved: 0.3101,
             reservedAsString: '0.310100000',
             toBeReserved: 0,
             toBeReservedAsString: '0.000000000' }
        }
     */
    async getAccountBalances(marketTraders) {
        await this.prepareSymbols();

        const ret = {};

        const mainBalance = await  this._market.getAccountBalance();
        const tradingBalance = await  this._market.getTradingBalance();
        for (let mainBalanceItem of mainBalance) {
            for (let tradingBalanceItem of tradingBalance) {
                if (mainBalanceItem.currency == tradingBalanceItem.currency) {
                    if (mainBalanceItem.available || tradingBalanceItem.available || tradingBalanceItem.reserved) {
                        let toBeUsedByTraders = 0;

                        if (marketTraders) {
                            for (let marketTraderKey in marketTraders) {
                                const marketTrader = marketTraders[marketTraderKey];
                                if (marketTrader._quoteCurrency == mainBalanceItem.currency) {
                                    toBeUsedByTraders += await marketTrader.getAvailableCurrency();
                                }
                            }
                        }

                        const retItem = {
                            currency: mainBalanceItem.currency,
                            main: parseFloat(mainBalanceItem.available),
                            mainAsString: this.priceToString(mainBalanceItem.currency, mainBalanceItem.available),
                            available: parseFloat(tradingBalanceItem.available),
                            availableAsString: this.priceToString(mainBalanceItem.currency, tradingBalanceItem.available),
                            reserved: parseFloat(tradingBalanceItem.reserved),
                            reservedAsString: this.priceToString(mainBalanceItem.currency, tradingBalanceItem.reserved),
                            toBeReserved: toBeUsedByTraders,
                            toBeReservedAsString: this.priceToString(mainBalanceItem.currency, toBeUsedByTraders),
                        };

                        ret[mainBalanceItem.currency] = retItem;
                    }
                }
            }
        }

        return ret;
    }

    /**
     * Get estimated balance in USD and BTC. Shows the same value as Estimated Balance in top right header of HitBTC interface
     * Convers all coins you have to USD and BTC based on current exchange rate and gets summary
     * Returns
     * {
            BTC: {
                total: 23.332342342343,
                totalAsString: '23.3323',
                price: 73200, // btc price
            },
            USD: {
                total: 123123123.332323,
                totalAsString: '123123123.33',
                price: (1/73200), // usdtobtc price
            }
        };
     */
    async getEstimatedAccountBalance() {
        await this.prepareSymbols();

        const mainBalance = await this._market.getAccountBalance();
        const tradingBalance = await this._market.getTradingBalance();

        const ret = {
            BTC: {
                total: 0,
                totalAsString: '0',
                price: 0, // btc price
            },
            USD: {
                total: 0,
                totalAsString: '0',
                price: 0, // usdtobtc price
            }
        };

        try {
            let btcPrice = 0;
            let balanceBTC = 0;
            let balanceUSD = 0;
            let estimatedUSD = 0;
            let estimatedBTC = 0;
            let toTransformItems = [];
            let neededPairs = [];
            for (let tradingBalanceItem of tradingBalance) {
                let itemValue = 0;

                for (let mainBalanceItem of mainBalance) {
                    if (mainBalanceItem.currency == tradingBalanceItem.currency) {
                        itemValue += parseFloat(mainBalanceItem.available);
                    }
                }
                itemValue += (parseFloat(tradingBalanceItem.available) + parseFloat(tradingBalanceItem.reserved));

                if (itemValue > 0) {
                    if (tradingBalanceItem.currency === 'USD') {
                        balanceUSD = itemValue;
                        estimatedUSD += balanceUSD;
                    } else if (tradingBalanceItem.currency === 'BTC') {
                        balanceBTC = itemValue;
                        estimatedBTC += balanceBTC;
                    } else if (tradingBalanceItem.currency === 'USDT') {
                        // ignore it as it's the copy of USD
                    } else {
                        let totalItem = itemValue;
                        let toTransform = {
                            currency: tradingBalanceItem.currency,
                            value: totalItem,
                            usdPair: null,
                            btcPair: null,
                        };

                        for (let symbolInfo of this._allSymbols) {
                            if ((symbolInfo.quoteCurrency == 'USD' || symbolInfo.quoteCurrency == 'USDT') && symbolInfo.baseCurrency == tradingBalanceItem.currency) {
                                toTransform.usdPair = symbolInfo.id.toUpperCase();
                                neededPairs.push(toTransform.usdPair);
                            }
                            if (symbolInfo.quoteCurrency == 'BTC' && symbolInfo.baseCurrency == tradingBalanceItem.currency) {
                                toTransform.btcPair = symbolInfo.id.toUpperCase();
                                neededPairs.push(toTransform.btcPair);
                            }
                        }

                        toTransformItems.push(toTransform);
                    }
                }
            }

            if (toTransformItems.length) {
                neededPairs.push('BTCUSD');

                /// need to get all symbols as some of them may have special symbol name
                let tickers = await this._market.getTickers(neededPairs);

                for (let symbol in tickers) {
                    let ticker = tickers[symbol];

                    for (let neededPair of toTransformItems) {
                        if (neededPair.usdPair == symbol) {
                            estimatedUSD += (neededPair.value * ticker.price);
                        }
                        if (neededPair.btcPair == symbol) {
                            estimatedBTC += (neededPair.value * ticker.price);
                        }
                    }
                }

                /// and transform BTC and USD to eachother
                let ticker = tickers['BTCUSD'];

                estimatedUSD += (balanceBTC * ticker.price);
                estimatedBTC += (balanceUSD / ticker.price);

                btcPrice = ticker.price;
            }

            ret.BTC.total = estimatedBTC;
            ret.BTC.totalAsString = this.priceToString('BTC', estimatedBTC);
            ret.BTC.price = btcPrice;

            ret.USD.total = estimatedUSD;
            ret.USD.totalAsString = this.priceToString('USD', estimatedUSD);
            ret.USD.price = (btcPrice ? (1/btcPrice) : 0);
        } catch(e) {
            console.error(e);
        }

        return ret;
    }


    /**
     * Prepare symbols information for use in other functions
     */
    async prepareSymbols() {
        if (this._symbolsPrepared) {
            return true;
        }

        this._allSymbols = await this._market.getAllSymbols();
        for (let symbolInfo of this._allSymbols) {
            if (!this._tickSizes[symbolInfo.quoteCurrency]) {
                this._tickSizes[symbolInfo.quoteCurrency] = symbolInfo.tickSize;
            }
            if (!this._tickSizes[symbolInfo.baseCurrency]) {
                this._tickSizes[symbolInfo.baseCurrency] = symbolInfo.quantityIncrement;
            }
        }

        this._symbolsPrepared = true;
    }

    /**
     * Converts currency value to human readable representation with respect to its _tickSize
     * @param  {String} currency BTC
     * @param  {Float} price    value
     * @return {String}          fomated value
     */
    priceToString(currency, price) {
        if (this._tickSizes[currency]) {
            return (parseFloat(price)).toFixed(Math.ceil(Math.abs(Math.log10(this._tickSizes[currency]))));
        }

        return price;
    }


    async evaluateSymbol(symbol) {
        const expectedPercentGrowth = 2.5;
        const pricesBidIntervalPercents = 0.09;

        const symbolInfo = await this._market.getSymbolInfo(symbol);

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
            let data = await this._market.getM5Candles(symbol, fromTime, getTo);

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

module.exports = MarketStatistics;