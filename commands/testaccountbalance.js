const { Program, Command } = require('lovacli');

const path = require('path');
const MarketStatistics = require('../classes/MarketStatistics.js');
const Notificator = require('../classes/Notificator.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Test account balance classes');
        // progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
    }

    async handle(args, options, logger) {
        const marketStatistics = new MarketStatistics();

        // const dispersion = await marketStatistics.getOrdersDispersion({
        // 	_symbol: "XRPUSDT",
        // 	_strategyName: 'Simple',
        // });

        const intervals = await Notificator.logMarketTraderDispersion({
            _symbol: "ADABTC",
            _strategyName: 'Simple',
        });

        // console.log(intervals);
        // let pr = 0;
        // for (let interval of intervals) {
        //     pr+= (interval.expectedProfit);
        // }

        // console.log("Total profit: "+pr);

        // console.log(dispersion);

        // const balance = await marketStatistics.getEstimatedAccountBalance();

        // console.log(balance);

        // const balance2 = await marketStatistics.getAccountBalances();

        // console.log(balance2);
    }
};

module.exports = Handler;