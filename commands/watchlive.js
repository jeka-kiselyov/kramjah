const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const Market = require('../classes/Market.js');
const ConsoleUI = require('../classes/ConsoleUI.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Look at market live');
        progCommand.argument('[filename]', '.dat file path');
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
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

        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);
        const symbol = args.symbol;

        let market = Market.getSingleton();
        market.setLogger(logger);

        logger.info('Getting symbol info: '+symbol);

        const symbolInfo = await market.getSymbolInfo(symbol);

        logger.info('Checking integrity of .dat file: '+filename);

        let timeStart = +new Date();

        const historicalMarket = new HistoricalMarket();
        await historicalMarket.readFromFile(filename);
        historicalMarket.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

        logger.info('Getting prices till now from real market... Run refreshdat over .dat file to make this step faster.');

        await historicalMarket.fulfilTillNow(symbol);

        logger.info('Filling prices gaps in last 2 weeks');

        await historicalMarket.fillGaps();

        logger.info('Filling older gaps if there are any');

        await historicalMarket.fillOlderGaps();

        logger.info('Checking integrity...');

        if (!historicalMarket.isIntegrityOk()) {
            throw new Error('Integrity is broken. Run refreshdat over .dat file');
        } else {
            logger.info('Integrity is ok');
        }

        if (args.ui) await ConsoleUI.initialize();
        if (args.ui) await ConsoleUI.setDataFromSymbolInfo(symbolInfo);

        let price = null;
        let time = (new Date()).getTime();
        let i = 0;
        do {
            const ticker = await market.getTicker(symbol);
            // console.log(ticker);

            await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(ticker);
            time = ticker.time;


            price = await historicalMarket.getPriceAt(time);
            price = await price.getInterval(HistoricalMarket.INTERVALS.MIN5);

            if (args.ui) await ConsoleUI.setLastPrice(price.price);
            try {
                if (args.ui) await ConsoleUI.drawTimePrice(price);
                if (args.ui) ConsoleUI.swawBuffers();
                if (!args.ui) logger.info(price.price);
            } catch(e) {
                logger.info(e);
                throw e;
            }

            // if (args.ui) await new Promise((res)=>{ setTimeout(res, 1000); });
            await new Promise((res)=>{ setTimeout(res, 1000); });
        } while(true);
    }
};

module.exports = Handler;