const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');
const ConsoleUI = require('../classes/ConsoleUI.js');

const MarketTrader = require('../classes/MarketTrader.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Look at market live');
        progCommand.argument('[filename]', '.dat file path');
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
        progCommand.argument('[ui]', 'Disply UI progress 0/1, default 1', 1);
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);
        const symbol = args.symbol;

        // const marketTrader = new MarketTrader();

        logger.info('Checking integrity of .dat file: '+filename);

        let timeStart = +new Date();

        const historicalMarket = new HistoricalMarket();
        await historicalMarket.readFromFile(filename);
        historicalMarket.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

        let realMarketData = new RealMarketData();

        let toTime = (new Date()).getTime();
        let fromTime = historicalMarket.getEndTime();

        fromTime  -= 7*24*60*60*1000; // move for one top level interval to the past to be sure we cover gaps

        while (fromTime < toTime) {
            let getTo = fromTime + 24 * 60 * 60 * 1000;
            let data = await realMarketData.getM5Candles(symbol, fromTime, getTo);

            let addedPricePoints = 0;
            for (let item of data) {
                await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(item);
                addedPricePoints++;
            }
            logger.info('Added '+addedPricePoints+' prices');

            await new Promise((res)=>{ setTimeout(res, 500); });
            fromTime += 24 * 60 * 60 * 1000;
        }

        logger.info('Checking integrity');

        let topLevelIntervals = historicalMarket.getTopLevelIntervals();
        let thereIsNotFull = 0;
        let fullIntervals = 0;
        for (let topLevelInterval of topLevelIntervals) {
            if (!topLevelInterval.isFull()) {
                thereIsNotFull++;
                logger.info((thereIsNotFull == 1 ? 'OK' : 'ERROR')+' Top level interval '+new Date(topLevelInterval.time)+' is not full');
            } else {
                fullIntervals++;
            }
        }

        if (thereIsNotFull > 1) {
            this.program.exit(0);
        }

        if (args.ui) await ConsoleUI.initialize();

        let price = null;
        let time = (new Date()).getTime();
        let i = 0;
        do {
            const ticker = await realMarketData.getTicker(symbol);
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


        // logger.info('Profit: '+ConsoleUI.currencyFormat(marketTrader.profitBalance));
        // logger.info('Estimated Balance: '+ConsoleUI.currencyFormat(marketTrader.getEstimatedPortfolioPrice()));
        // logger.info('If Would HODL: '+ConsoleUI.currencyFormat(marketTrader.getIfWouldHODLPortfolioPrice()));
        // logger.info('Item Balance: '+ConsoleUI.itemValueFormat(marketTrader.itemBalance));
    }
};

module.exports = Handler;