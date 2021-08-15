const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');
const ConsoleUI = require('../classes/ConsoleUI.js');
const TradingApi = require('../classes/TradingApi.js');

const Notificator = require('../classes/Notificator.js');
const MarketTrader = require('../classes/MarketTrader.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Go to the current market and trade over all symbols-strategies defined in settings');
        progCommand.argument('[ui]', 'Disply UI progress 0/1, default 1', 1);
    }

    async handle(args, options, logger) {
        if (args.ui) {
            const rawLogger = logger;
            logger = {
                info: (...fArgs)=>{
                    if (ConsoleUI.isInitialized()) {
                        ConsoleUI.debug.apply(ConsoleUI, fArgs);
                    } else {
                        rawLogger.info.apply(rawLogger, fArgs);
                    }
                },
                error: (...fArgs)=>{
                    rawLogger.error.apply(rawLogger, fArgs);
                }
            };
        }

        const config = this.program.config;
        const realMarketData = new RealMarketData();

        if (!config.traders) {
            throw new Error('No traders defined in settings');
        } else {
            logger.info('There re '+config.traders.length+' traders defined in settings');
        }

        const marketTraders = {};

        await Notificator.onMessage(async (message)=>{
            try {
                if (message && message.text && message.text.indexOf('balance') != -1) {
                    const tradingApi = new TradingApi();
                    await Notificator.logAccountBalance(tradingApi, marketTraders);
                }
                if (message && message.text && message.text.indexOf('traders') != -1) {
                    await Notificator.logMarketTraders(marketTraders);
                }
                if (message && message.text && message.text.indexOf('chart') != -1) {
                    await Notificator.logChartCommand(message.text, marketTraders);
                }
            } catch(e) {
                console.error(e);
            }
        });


        for (let traderSetting of config.traders) {
            logger.info('Initializing trader '+traderSetting.symbol+' '+traderSetting.strategyName+' over dat file '+traderSetting.dat);

            const datPath = traderSetting.dat;
            const symbol = traderSetting.symbol;
            const strategyName = traderSetting.strategyName;
            const key = ''+symbol+'_'+strategyName;

            if (marketTraders[key]) {
                throw new Error('Trading over same symbol-strategyName pair is not supported');
            }

            const marketTrader = new MarketTrader({
                symbol: symbol,
                mode: 'market',
                strategyName: strategyName,
                logger: logger,
            });

            try {
                await marketTrader.prepareSymbolInfo(); // load symbol information from market (this api is public, no api keys needed)
                logger.info('Got symbol infromation from the market: '+symbol);
            } catch(e) {
                logger.error('Can not get symbol information from the market');
                this.program.exit(null);
            }

            logger.info('Restoring bids data from market...');
            await marketTrader.restoreDataFromMarket();

            const currentPath = process.cwd();
            const filename = path.join(currentPath, datPath);

            logger.info('Loading .dat file with historical prices: '+filename);

            let timeStart = +new Date();

            marketTrader.historicalMarket = new HistoricalMarket();
            await marketTrader.historicalMarket.readFromFile(filename);
            marketTrader.historicalMarket.disableCSV();

            let timeEnd = +new Date();
            logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

            logger.info('Getting prices till now from real market... Run refreshdat over .dat file to make this step faster.');

            await marketTrader.historicalMarket.fulfilTillNow(symbol);

            logger.info('Filling prices gaps in last 2 weeks');

            await marketTrader.historicalMarket.fillGaps();

            logger.info('Filling older gaps if there are any');

            await marketTrader.historicalMarket.fillOlderGaps();

            logger.info('Checking integrity...');

            if (!marketTrader.historicalMarket.isIntegrityOk()) {
                throw new Error('Integrity is broken. Run refreshdat over .dat file');
            } else {
                logger.info('Integrity is ok');
            }

            marketTraders[key] = marketTrader;

            logger.info('Trader '+key+' is ready');
        }

        logger.info('Traders are ready');

        logger.info('Starting trading...');

        if (args.ui) {
            await ConsoleUI.initialize();
            ConsoleUI.setMarketTraders(marketTraders);
            ConsoleUI.scheduleMarketTradersLoop();
        }

        do {
            for (let marketTraderKey in marketTraders) {
                const marketTrader = marketTraders[marketTraderKey];
                const historicalMarket = marketTrader.historicalMarket;
                const symbol = marketTrader._symbol;

                let forTheRace = new Promise((res)=>{
                    realMarketData.getTicker(symbol)
                        .then(async(ticker)=>{
                            let price = null;
                            let time = null;

                            if (ticker) {
                                await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(ticker);
                                time = ticker.time;

                                price = await historicalMarket.getPriceAt(time);
                                price = await price.getInterval(HistoricalMarket.INTERVALS.MIN5); // price is pricecombined now

                                if (price) {
                                    try {
                                        await marketTrader.processNewCombinedPrice(price);
                                    } catch(e) {
                                        console.error(e);
                                    }
                                }

                                // if (args.ui) await ConsoleUI.setDataFromMarketTrader(marketTrader);

                                try {
                                    // if (args.ui) await ConsoleUI.drawTimePrice(price);
                                    // if (args.ui) await ConsoleUI.drawMarketTrader(marketTrader);
                                    // if (args.ui) ConsoleUI.swawBuffers();
                                    if (!args.ui) logger.info(''+marketTraderKey+' - current price: '+price.price);
                                } catch(e) {
                                    logger.info(e);
                                    throw e;
                                }
                            }

                            res();
                        });
                });

                // limit single trade itteration execution to 20 seconds
                //
                try {
                    await Promise.race([forTheRace, new Promise((res)=>{ setTimeout(res, 20000); })]);
                } catch(e) {}

                // try {
                //     const marketTrader = marketTraders[marketTraderKey];
                //     const historicalMarket = marketTrader.historicalMarket;
                //     const symbol = marketTrader._symbol;

                //     const ticker = await realMarketData.getTicker(symbol);

                //     let price = null;
                //     let time = null;

                //     if (ticker) {
                //         await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(ticker);
                //         time = ticker.time;

                //         price = await historicalMarket.getPriceAt(time);
                //         price = await price.getInterval(HistoricalMarket.INTERVALS.MIN5); // price is pricecombined now

                //         if (price) {
                //             try {
                //                 await marketTrader.processNewCombinedPrice(price);
                //             } catch(e) {
                //                 console.error(e);
                //             }
                //         }

                //         // if (args.ui) await ConsoleUI.setDataFromMarketTrader(marketTrader);

                //         try {
                //             // if (args.ui) await ConsoleUI.drawTimePrice(price);
                //             // if (args.ui) await ConsoleUI.drawMarketTrader(marketTrader);
                //             // if (args.ui) ConsoleUI.swawBuffers();
                //             if (!args.ui) logger.info(''+marketTraderKey+' - current price: '+price.price);
                //         } catch(e) {
                //             logger.info(e);
                //             throw e;
                //         }
                //     }
                // } catch(e) {
                //     console.error(e);
                // }

                await new Promise((res)=>{ setTimeout(res, 2000); });
            }
        } while(true);

    }
};

module.exports = Handler;