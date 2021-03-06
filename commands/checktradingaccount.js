const { Program, Command } = require('lovacli');

const path = require('path');
const TradingApi = require('../classes/TradingApi.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Get and display information from trading account');
    }

    async handle(args, options, logger) {
        const tradingApi = new TradingApi();
        let tb = await tradingApi.getTradingBalance();

        console.log(tb);

        let ao = await tradingApi.getActiveOrders({
            symbol: 'BTCUSD',
        });

        // console.log(ao);

        let order = await tradingApi.getHistoryOrderByClientOrderId({
            symbol: 'BTCUSD',
            clientOrderId: '45197.275839999995_1614480761811',
        });

        console.log(order);

        order = await tradingApi.getOrderByClientOrderIdWithCache({
            symbol: 'BTCUSD',
            clientOrderId: '1cb1ccae83784e8633515a83c34ff6fb',
        });

        await new Promise((res)=>{ setTimeout(res, 5000); });

        order = await tradingApi.getOrderByClientOrderIdWithCache({
            symbol: 'BTCUSD',
            clientOrderId: '1cb1ccae83784e8633515a83c34ff6fb',
        });

        let history = await tradingApi.getHistoryOrders({
            symbol: 'BTCUSD',
        });

        // console.log(history);

        // await tradingApi.placeBuyOrder({
        //     symbol: 'BTCUSD',
        //     quantity: 0.0001,
        //     price: 45113.50,
        // });
    }
};

module.exports = Handler;