const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const ConsoleUI = require('../classes/ConsoleUI.js');

const MarketTrader = require('../classes/MarketTrader.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Look at history at the high speed');
        progCommand.argument('[filename]', '.dat file path with historical prices');
        progCommand.argument('[strategyName]', 'strategyName');
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
        progCommand.argument('[ui]', 'Disply UI progress 0/1, default 0', 0);
        progCommand.argument('[fromTime]', 'trade from timestamp, pass nothing to trade from the very begining, 0 - to trade from the begining');
        progCommand.argument('[toTime]', 'trade to timestamp, pass nothing to trade to the very end, 0 - to trade to the very end');
        progCommand.argument('[startBalance]', 'trade balance of currency in the begining, 1000 by default');
    }

    async handle(args, options, logger) {
        if (args.ui == '0') args.ui = false;

        if (args.ui) {
            const rawLogger = logger;
            logger = {
                info: (...fArgs)=>{
                    if (ConsoleUI.isInitialized()) {
                        ConsoleUI.debug.apply(ConsoleUI, fArgs);
                    } else {
                        rawLogger.info.apply(rawLogger, fArgs);
                    }
                }
            };
        }

        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);

        let startBalance = null;
        if (args.startBalance && args.startBalance != '0') {
            startBalance = parseFloat(args.startBalance, 10);
        }

        const marketTrader = new MarketTrader({
            operatingBalance: startBalance,
            strategyName: args.strategyName,
            symbol: args.symbol,
            logger: logger,
        });

        try {
            await marketTrader.prepareSymbolInfo(); // load symbol information from market (this api is public, no api keys needed)
            logger.info('Got symbol infromation from the market: '+args.symbol);
        } catch(e) {
            console.log(e);

            logger.error('Can not get symbol information from the market: '+args.symbol);
            this.program.exit(null);
        }

        logger.info('Checking integrity of .dat file: '+filename);

        let timeStart = +new Date();

        const historicalMarker = new HistoricalMarket();
        await historicalMarker.readFromFile(filename);
        historicalMarker.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

        let historicalStartTime = historicalMarker.getStartTime();
        let historicalEndTime = historicalMarker.getEndTime();
        let startTime = historicalStartTime;
        let endTime = historicalEndTime;

        let curTimeInSeconds = (+new Date())/1000;
        if (args.fromTime && args.fromTime != '0') {
            startTime = parseInt(args.fromTime, 10);
            if (startTime > curTimeInSeconds) {
                // passed in milliseconds, all is fine
            } else {
                startTime = Math.floor(startTime * 1000);
            }
        }

        if (args.toTime & args.toTime != '0') {
            endTime = parseInt(args.toTime, 10);
            if (endTime > curTimeInSeconds) {
                // passed in milliseconds, all is fine
            } else {
                endTime = Math.floor(endTime * 1000);
            }
        }


        // startTime += 200 * 60 * 60 * 1000;
        //
        //
        // startTime = 1513345911000;
        // endTime = 1513345911000 + 30*12*24*60*60*1000;

        if (startTime < historicalStartTime) {
            logger.info('Correcting start time');
        }
        if (endTime > historicalEndTime) {
            logger.info('Correcting end time');
        }

        logger.info('Doing market trading simulation...');
        logger.info(' from '+new Date(startTime));
        logger.info('   to '+new Date(endTime));


        if (args.ui) {
            await ConsoleUI.initialize();
        }

        let price = null;
        let time = startTime; // startTime + (1000*60*5)*120;
        let i = 0;
        do {
            price = await historicalMarker.getPriceAt(time);
            if (price) {
                try {
                    await marketTrader.processNewCombinedPrice(price);
                } catch(e) {
                    console.error(e);
                }
            }

            if (args.ui) await ConsoleUI.setDataFromMarketTrader(marketTrader);
            // if (args.ui) await ConsoleUI.setBaseCurrency(marketTrader.baseCurrency);
            // if (args.ui) await ConsoleUI.setQuoteCurrency(marketTrader.quoteCurrency);

            try {
                if (args.ui) await ConsoleUI.drawTimePrice(price);
                if (args.ui) await ConsoleUI.drawMarketTrader(marketTrader);
                if (args.ui) ConsoleUI.swawBuffers();
            } catch(e) {

            }

            if (args.ui) await new Promise((res)=>{ setTimeout(res, 1); });
            time+=(1000*60*5); i+=1;
        } while(time <= endTime);


        ConsoleUI.setDataFromMarketTrader(marketTrader);
        logger.info('Profit: '+ConsoleUI.currencyFormat(marketTrader.profitBalance));
        logger.info('Estimated Balance: '+ConsoleUI.currencyFormat(marketTrader.getEstimatedPortfolioPrice()));
        logger.info('If Would HODL: '+ConsoleUI.currencyFormat(marketTrader.getIfWouldHODLPortfolioPrice()));
        logger.info('Item Balance: '+ConsoleUI.itemValueFormat(marketTrader.itemBalance));
    }
};

module.exports = Handler;