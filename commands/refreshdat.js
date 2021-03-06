const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Fill .dat file with new values from HitBTC api candles data');
        progCommand.argument('<filename>', '.dat file path');
        // progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);
        const outputFilename = filename.split('.dat').join('_updated.dat');

        logger.info('Updating .dat file with fresh data: '+filename);

        let timeStart = +new Date();

        const historicalMarket = new HistoricalMarket({filename: path.join(__dirname, '../../data/btcusd.csv'), hasHeader: true});
        await historicalMarket.readFromFile(filename);
        historicalMarket.disableCSV();

        let timeEnd = +new Date();
        logger.info('Loaded original in '+(timeEnd - timeStart)+' ms');

        const fileEndTime = historicalMarket.getEndTime();
        logger.info('Data ending on '+new Date(fileEndTime));

        let topLevelIntervals = historicalMarket.getTopLevelIntervals();

        logger.info('OK. There re '+topLevelIntervals.length+' top level intervals');

        let realMarketData = new RealMarketData();

        let toTime = (new Date()).getTime();
        let fromTime = fileEndTime;

        fromTime  -= 7*24*60*60*1000;

        while (fromTime < toTime) {
            let getTo = fromTime + 24 * 60 * 60 * 1000;
            let data = await realMarketData.getM5Candles('BTCUSD', fromTime, getTo);

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

        if (thereIsNotFull > 1) {
        } else {
            logger.info('OK. There re '+fullIntervals+' full top level intervals after update');

            logger.info('Read everyhing. Saving .dat to file...');
            await historicalMarket.saveToFile(outputFilename);
            logger.info('Done. You can run testdat command to check .dat file');
        }




        // let data = await realMarketData.getM5Candles('BTCUSD', fromTime, toTime);

        // let addedPricePoints = 0;
        // for (let item of data) {
        //     await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(item);
        //     addedPricePoints++;
        // }

        // logger.info('Added '+addedPricePoints+' prices');
    }
};

module.exports = Handler;