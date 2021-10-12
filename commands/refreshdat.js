const { Program, Command } = require('lovacli');

const path = require('path');
const Market = require('../classes/Market.js');
const HistoricalMarket = require('../classes/HistoricalMarket.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Fill .dat file with new values from HitBTC api candles data');
        progCommand.argument('<filename>', '.dat file path');
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
        // progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);
        const outputFilename = filename.split('.dat').join('_updated.dat');

        logger.info('Updating .dat file with fresh data: '+filename);

        let timeStart = +new Date();

        const historicalMarket = new HistoricalMarket();
        await historicalMarket.readFromFile(filename);
        historicalMarket.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded original in '+(timeEnd - timeStart)+' ms');

        const fileEndTime = historicalMarket.getEndTime();
        logger.info('Data ending on '+new Date(fileEndTime));

        let topLevelIntervals = historicalMarket.getTopLevelIntervals();

        logger.info('OK. There re '+topLevelIntervals.length+' top level intervals');

        logger.info('Getting prices till now from real market... Run refreshdat over .dat file to make this step faster.');

        await historicalMarket.fulfilTillNow(args.symbol);

        logger.info('Filling prices gaps in last 2 weeks');

        await historicalMarket.fillGaps();
        await historicalMarket.fillOlderGaps();

        logger.info('Checking integrity');

        topLevelIntervals = historicalMarket.getTopLevelIntervals();
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

        await Market.close(); // close websockets if any

        if (thereIsNotFull > 1) {
        } else {
            logger.info('OK. There re '+fullIntervals+' full top level intervals after update');

            logger.info('Read everyhing. Saving .dat to file...');
            await historicalMarket.saveToFile(outputFilename);
            logger.info('Done. You can run testdat command to check .dat file');
        }
    }
};

module.exports = Handler;