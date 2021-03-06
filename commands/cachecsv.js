const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Cache .csv file to .dat file for faster initialization');
        progCommand.argument('<filename>', '.csv file path');
        progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
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

        logger.info('Reading and calculating data...');
        await r.prepareToBeSaved(args.maxWeeks);

        logger.info('Read everyhing. Saving .dat to file...');
        await r.saveToFile(outputFilename);
        logger.info('Done. You can run testdat command to check .dat file');
    }
};

module.exports = Handler;