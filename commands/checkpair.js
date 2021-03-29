const { Program, Command } = require('lovacli');

const RealMarketData = require('../classes/RealMarketData.js');
const ObjectsToCsv = require('objects-to-csv');

class Handler extends Command {
    setup(progCommand) {
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
    }

    async handle(args, options, logger) {
        const symbol = args.symbol;

        let realMarketData = new RealMarketData();

        // logger.info('Getting symbol info: '+symbol);

        const symbolEvaluations = [];
        const allSymbols = await realMarketData.getAllSymbols();

        let c = 0;
        for (let symbolInfo of allSymbols) {
            // if (symbolInfo.quoteCurrency != 'BTC') continue;

            const symbolEvaluation = await realMarketData.evaluateSymbol(symbolInfo.id);
            symbolEvaluations.push(symbolEvaluation);

            c++;
        }

        const csv = new ObjectsToCsv(symbolEvaluations);
        console.log(await csv.toString());
    }
};

module.exports = Handler;