const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');
const ConsoleUI = require('../classes/ConsoleUI.js');

const MarketTrader = require('../classes/MarketTrader.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Look at market live in console');
        progCommand.argument('<symbol>', 'symbol');
    }

    async handle(args, options, logger) {
        const symbol = args.symbol;

        let realMarketData = new RealMarketData();

        do {
            const ticker = await realMarketData.getTicker(symbol);
            console.log(ticker);

            await new Promise((res)=>{ setTimeout(res, 1000); });
        } while(true);
    }
};

module.exports = Handler;