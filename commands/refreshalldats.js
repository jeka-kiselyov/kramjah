const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Fill .dat files defined for trading in settings with new values from HitBTC api candles data');
    }

    async handle(args, options, logger) {
        const config = this.program.config;
        const tradersSettings = config.traders;

        logger.info('There re '+tradersSettings.length+' traders defined in settings');
        logger.info('Refreshing dat files for them');

        const currentPath = process.cwd();


        for (let tradersSetting of tradersSettings) {
            const filename = path.join(currentPath, tradersSetting.dat);
            // const outputFilename = filename.split('.dat').join('_updated.dat');
            const symbol = tradersSetting.symbol;


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

            await historicalMarket.fulfilTillNow(symbol);

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

            if (thereIsNotFull > 1) {
            } else {
                logger.info('OK. There re '+fullIntervals+' full top level intervals after update');

                logger.info('Read everyhing. Saving .dat to file...');
                await historicalMarket.saveToFile(filename);
                logger.info('Done. You can run testdat command to check .dat file');
            }
        }

    }

};

module.exports = Handler;