const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Cache .csv file to .dat file for faster initialization');
        progCommand.argument('<filename>', '.csv file path');
        progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
        progCommand.argument('[fromTime]', 'start caching by specific timestamp to make .dat file faster to load for live trading initialization');
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);
        const outputFilename = filename.split('.csv').join('.dat');

        logger.info('Caching .csv file file: '+filename);
        logger.info('Going to save at: '+outputFilename);
        logger.info('This will take few minutes...');

        const r = new HistoricalMarket({filename: filename, hasHeader: true});
        logger.info('Preparing csv memory...');
        await r.prepareMemory();


        let startTime = null;

        let curTimeInSeconds = (+new Date())/1000;
        if (args.fromTime && args.fromTime != '0') {
            startTime = parseInt(args.fromTime, 10);
            if (startTime > curTimeInSeconds) {
                // passed in milliseconds, all is fine
            } else {
                startTime = Math.floor(startTime * 1000);
            }
        }

        logger.info('Reading and calculating data...');
        await r.prepareToBeSaved(args.maxWeeks, startTime);

        logger.info('Read everyhing. Saving .dat to file...');
        await r.saveToFile(outputFilename);
        logger.info('Done. You can run testdat command to check .dat file');
    }
};

module.exports = Handler;