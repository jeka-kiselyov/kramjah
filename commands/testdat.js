const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Test .dat file for integrity');
        progCommand.argument('[filename]', '.dat file path');
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);

        logger.info('Checking integrity of .dat file: '+filename);

        let timeStart = +new Date();

        const historicalMarker = new HistoricalMarket({filename: path.join(__dirname, '../../data/btcusd.csv'), hasHeader: true});
        await historicalMarker.readFromFile(filename);
        historicalMarker.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

        const startTime = historicalMarker.getStartTime();
        logger.info('Data starting from '+new Date(startTime));

        const endTime = historicalMarker.getEndTime();
        logger.info('Data ending on '+new Date(endTime));

        const expectedMinIntervalPointsCount = ( (endTime - startTime) / (1000 * 60 * 5) ) + 1;
        logger.info('Expected count of price time points: '+expectedMinIntervalPointsCount);

        const minIntervalPointsCount = historicalMarker.getMinIntervalPointsCount();
        logger.info('Count of price time points: '+minIntervalPointsCount);

        const topLevelIntervals = historicalMarker.getTopLevelIntervals();
        let thereIsNotFull = false;
        for (let topLevelInterval of topLevelIntervals) {
            if (!topLevelInterval.isFull()) {
                thereIsNotFull = true;
                logger.info('ERRROR. Top level interval '+new Date(topLevelInterval.time)+' is not full');
            } else {
            }
        }

        if (thereIsNotFull) {
        } else {
            logger.info('OK. There re '+topLevelIntervals.length+' full top level intervals');
        }

        logger.info('Going through all time range...');

        timeStart = +new Date();

        let price = null;
        let time = startTime;
        let priceOnStart = null;
        let priceOnEnd = null;
        let i = 0;
        do {
            price = await historicalMarker.getPriceAt(time);
            if (i == 0) priceOnStart = price.price;
            time+=(1000*60*5); i+=1;
        } while(time <= endTime);
        priceOnEnd = price.price;
        timeEnd = +new Date();

        logger.info('Run through '+i+' time points in '+(timeEnd - timeStart)+' ms');
        logger.info('Price on start '+new Date(startTime)+' was '+priceOnStart);
        logger.info('Price on end '+new Date(endTime)+' was '+priceOnEnd);

        if (i == expectedMinIntervalPointsCount && i == minIntervalPointsCount) {
            logger.info('OK');
        } else {
            logger.info('ERROR: time points counts mismatch');
        }
    }
};

module.exports = Handler;