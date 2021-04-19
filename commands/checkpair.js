const { Program, Command } = require('lovacli');

const RealMarketData = require('../classes/RealMarketData.js');
const ObjectsToCsv = require('objects-to-csv');

class Handler extends Command {
    setup(progCommand) {
        progCommand.argument('[quoteCurrency]', 'quoteCurrency to filter by, BTC, USD, ETH');
        progCommand.argument('[minimumDayQuoteCurrencyVolume]', 'value for minimum last day volume in quote curency to check');
    }

    async handle(args, options, logger) {
        const symbol = args.symbol;

        const minimumDayQuoteCurrencyVolume = parseFloat(args.minimumDayQuoteCurrencyVolume, 10);
        const quoteCurrency = args.quoteCurrency ? (''+args.quoteCurrency).toUpperCase() : null;

        let realMarketData = new RealMarketData();

        // logger.info('Getting symbol info: '+symbol);

        const symbolEvaluations = [];
        const allSymbols = await realMarketData.getAllSymbols();

        let c = 0;
        for (let symbolInfo of allSymbols) {
            if (quoteCurrency && symbolInfo.quoteCurrency != quoteCurrency) continue;

            const lastD1Candle = await realMarketData.getLastD1Candle(symbolInfo.id);
            const lastDayQuoteCurrencyVolume = lastD1Candle ? parseFloat(lastD1Candle.volumeQuote, 10) : 0;

            if (minimumDayQuoteCurrencyVolume && minimumDayQuoteCurrencyVolume > lastDayQuoteCurrencyVolume) continue;

            // console.log(symbolInfo); continue;

            const symbolEvaluation = await realMarketData.evaluateSymbol(symbolInfo.id);
            symbolEvaluations.push(symbolEvaluation);

            c++;
        }

        const csv = new ObjectsToCsv(symbolEvaluations);
        console.log(await csv.toString());
    }
};

module.exports = Handler;