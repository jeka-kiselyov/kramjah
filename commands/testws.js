const { Program, Command } = require('lovacli');

const path = require('path');
const HitBTC = require('../classes/markets/HitBtc.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Test ws');
    }

    async handle(args, options, logger) {
        const hb = new HitBTC({logger: logger});

        let resp = await hb.publicGetAllSymbols();
        console.log(1);
        resp = await hb.publicGetAllSymbols();
        console.log(2);
        resp = await hb.publicGetSymbolInfo('ethusd');
        console.log(resp);
        resp = await hb.publicGetTicker('ethusd');
        console.log(resp);

        resp = await hb.publicGetTicker('btcusd');
        console.log(resp);


        resp = await hb.getOrderByClientOrderId('btcusd', '23');
        console.log(resp);

        const activeOrders = hb.getActiveOrders('btcusd');

        const stats = {
            buy: 0,
            sell: 0,
        };
        for (let order of activeOrders) {
            if (order.side == 'buy') stats.buy++;
            if (order.side == 'sell') stats.sell++;
        }

        console.log(stats);

        // console.log(resp);
        //
        hb.on('updated', (order)=>{
            console.log('order updated', order);
        });

        await new Promise((res)=>{ setTimeout(res, 10000); });
        resp = await hb.publicGetTicker('ethusd');
        console.log(resp);
        await new Promise((res)=>{ setTimeout(res, 10000); });
        resp = await hb.publicGetTicker('ethusd');
        console.log(resp);
        await new Promise((res)=>{ setTimeout(res, 10000); });
        await new Promise((res)=>{ setTimeout(res, 10000); });
        await new Promise((res)=>{ setTimeout(res, 10000); });
        await new Promise((res)=>{ setTimeout(res, 10000); });
        await new Promise((res)=>{ setTimeout(res, 10000); });
        await new Promise((res)=>{ setTimeout(res, 10000); });
    }
};

module.exports = Handler;