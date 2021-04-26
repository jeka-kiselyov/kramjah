const { Program, Command } = require('lovacli');

const path = require('path');
const TradingApi = require('../classes/TradingApi.js');
const RealMarketData = require('../classes/RealMarketData.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Get and display information from trading account');
        progCommand.argument('[strategyName]', 'strategyName');
        progCommand.argument('[symbol]', 'trading symbol pair name, like btcusd');
    }

    async handle(args, options, logger) {
        const tradingApi = new TradingApi();
        const realMarketData = new RealMarketData();

        const symbol = args.symbol;
        const strategyName = args.strategyName;

        const symbolInfo = await realMarketData.getSymbolInfo(symbol);

        const tradingBalance = await tradingApi.getTradingBalance();
        const itemCurrency = symbolInfo.baseCurrency;
        let itemBalance = 0;
        let itemReserved = 0;

        for (let tradingBalanceItem of tradingBalance) {
            if (tradingBalanceItem.currency == itemCurrency) {
                itemBalance = parseFloat(tradingBalanceItem.available, 10);
                itemReserved  = parseFloat(tradingBalanceItem.reserved, 10);
            }
        }

        let logPrefix = ''+symbol+' - '+strategyName;

        logger.info('Checking trading over '+symbolInfo.baseCurrency+' with '+symbolInfo.quoteCurrency);

        const importantOrders = await tradingApi.getRecentOrdersBySymbolAndStrategyName({
            symbol: symbol,
            strategyName: strategyName,
            outdatedToo: true,
            notOursToo: true,
        });

        // console.log(importantOrders);

        let toBuyOrderCount = 0;
        let toSellOrderCount = 0;
        let boughtOrdersWithNoSellOrder = 0;
        let boughtOrdersWithNoSellOrderItemValue = 0;
        let notImportantOrders = 0;
        let reservedCurrency = 0;
        let goingToSoldAndGetCurrency = 0;

        for (let order of importantOrders) {
            if (order.status == 'partiallyFilled' || order.status == 'new') {
                if (order.side == 'buy') {
                    toBuyOrderCount++;

                    reservedCurrency += (parseFloat(order.price, 10) * parseFloat(order.quantity, 10));
                } else {
                    toSellOrderCount++;

                    goingToSoldAndGetCurrency += (parseFloat(order.price, 10) * parseFloat(order.quantity, 10));
                }
            } else if (order.status == 'filled' && order.side == 'buy') {
                if (!order.notOurs) {
                    boughtOrdersWithNoSellOrder++;
                    boughtOrdersWithNoSellOrderItemValue += parseFloat(order.quantity, 10);

                    // console.log(order);
                }

            } else {
                notImportantOrders++;
            }
        }

        logger.info(logPrefix, 'Not important orders: '+notImportantOrders);
        logger.info(logPrefix, 'Bought without to sell: '+boughtOrdersWithNoSellOrder);
        logger.info(logPrefix, 'Active to buy orders: '+toBuyOrderCount);
        logger.info(logPrefix, 'Active to sell orders: '+toSellOrderCount);
        logger.info(logPrefix, 'Total active orders: '+(toBuyOrderCount + toSellOrderCount));

        logger.info(logPrefix, 'Currency reserved for buy orders: '+reservedCurrency);
        logger.info(logPrefix, 'Currency reserved for buy orders + going get from sell: '+(reservedCurrency+goingToSoldAndGetCurrency));

        if (itemBalance < boughtOrdersWithNoSellOrderItemValue) {
            logger.info(logPrefix, 'There re orders impossible to create sell orders over. Sold something manually?');
        }

        let totalBought = 0;
        let totalSold = 0;

        let totalBoughtNotOurs = 0;
        let totalSoldNotOurs = 0;

        for (let order of importantOrders) {
            if (order.status == 'filled') {

                if (order.side == 'buy' && !order.notOurs) totalBought += parseFloat(order.cumQuantity, 10);
                if (order.side == 'sell' && !order.notOurs) totalSold += parseFloat(order.cumQuantity, 10);

                if (order.side == 'buy' && order.notOurs) totalBoughtNotOurs += parseFloat(order.cumQuantity, 10);
                if (order.side == 'sell' && order.notOurs) totalSoldNotOurs += parseFloat(order.cumQuantity, 10);

            }

            if (!order.notOurs) {
                console.log('-----');

                let sum = parseFloat(order.price, 10) * parseFloat(order.cumQuantity, 10);

                console.log('-'+order.originalPrice+'-'+order.side+'-'+order.status+'--'+sum);
            } else {
                console.log('-'+order.clientOrderId+'-'+order.side+'-'+order.status+'--'+order.quantity);
            }

            let groupSellCount = 0;
            let groupBuyCount = 0;
            let groupItemShift = 0;

            for (let olderOrder of order.previousOrders) {
                if (olderOrder.status == 'filled') {

                    let sum = parseFloat(olderOrder.price, 10) * parseFloat(olderOrder.cumQuantity, 10);

                    console.log('-'+olderOrder.createdAt+'-'+olderOrder.originalPrice+'-'+olderOrder.side+'-'+olderOrder.status+'-'+sum+'-'+olderOrder.price+'-'+olderOrder.cumQuantity);

                    if (olderOrder.side == 'buy' && !order.notOurs) totalBought += parseFloat(olderOrder.cumQuantity, 10);
                    if (olderOrder.side == 'sell' && !order.notOurs) totalSold += parseFloat(olderOrder.cumQuantity, 10);

                    if (olderOrder.side == 'buy' && olderOrder.notOurs) totalBoughtNotOurs += parseFloat(olderOrder.cumQuantity, 10);
                    if (olderOrder.side == 'sell' && olderOrder.notOurs) totalSoldNotOurs += parseFloat(olderOrder.cumQuantity, 10);

                    if (olderOrder.side == 'buy') groupBuyCount++;
                    if (olderOrder.side == 'sell') groupSellCount++;

                    if (olderOrder.side == 'buy') groupItemShift += parseFloat(olderOrder.cumQuantity, 10);
                    if (olderOrder.side == 'sell') groupItemShift -= parseFloat(olderOrder.cumQuantity, 10);
                }
            }

            if (order.status == 'filled') {
                if (order.side == 'buy') groupItemShift += parseFloat(order.cumQuantity, 10);
                if (order.side == 'sell') groupItemShift -= parseFloat(order.cumQuantity, 10);
            }

            // console.log(groupItemShift);

            if (0) {
                if (groupBuyCount-1 == groupSellCount && order.status == 'filled' && order.side == 'sell') console.log('++++');
                else if (groupBuyCount-1 == groupSellCount && order.status == 'new' && order.side == 'sell') console.log('++++');
                else if (groupSellCount == groupBuyCount && order.status == 'new' && order.side == 'buy') console.log('++++');
                else {
                    // console.log(order);
                    // console.log('---------------------------------------------');
                }
            }


            // if (groupBuyCount-1 == groupSellCount && order.status == 'new' && order.side == 'sell') console.log('-----');
            // else if (groupBuyCount == groupSellCount && order.status == 'filled') console.log('----+');
           // console.log('----------'+(groupBuyCount - groupSellCount));
        }

        logger.info(logPrefix, 'Total item was bought not ours all time: '+totalBoughtNotOurs);
        logger.info(logPrefix, 'Total item was sold not ours all time: '+totalSoldNotOurs);

        logger.info(logPrefix, 'Total item was bought all time: '+totalBought);
        logger.info(logPrefix, 'Total item was sold all time: '+totalSold);
        logger.info(logPrefix, 'Item currently reserved: '+itemReserved);

        logger.info(logPrefix, 'Diff: '+(totalBought - totalSold - itemReserved));
        // logger.info(logPrefix, 'Diff with not ours: '+(totalBought + totalBoughtNotOurs - totalSold - totalSoldNotOurs - itemReserved));
        logger.info(logPrefix, 'Avaliable item balance: '+itemBalance);

        logger.info(logPrefix, 'Items needed for sell orders: '+boughtOrdersWithNoSellOrderItemValue);

    }
};

module.exports = Handler;