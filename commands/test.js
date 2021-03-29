const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const RealMarketData = require('../classes/RealMarketData.js');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Test');
        // progCommand.argument('[maxWeeks]', 'maximum number of weeks to cache, default - cache everything', 0);
    }

    async handle(args, options, logger) {
        const historicalMarker = new HistoricalMarket();
        await historicalMarker.readFromFile('../data/adabtc.dat');
        historicalMarker.disableCSV();


        let historicalStartTime = historicalMarker.getStartTime();
        let historicalEndTime = historicalMarker.getEndTime();
        let startTime = historicalStartTime;
        let endTime = historicalEndTime;

        let price = null;
        let prevPrice = null;
        let time = startTime; // startTime + (1000*60*5)*120;
        let i = 0;
        do {
            price = await historicalMarker.getPriceAt(time);

            let interval = await price.getInterval(60 * 60 * 1000);

            try {
                let prevInterval = await interval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
                prevInterval = await prevInterval.getPrev();
            } catch(e) {

            }
            console.log(price.time, interval.time);

            if (prevPrice && price) {
                if (Math.abs(prevPrice.time - price.time) > 1000 * 60 * 5) {
                    throw new Error('1');
                }
                if (Math.abs(interval.time - price.time) > 1000 * 60 * 60) {
                    throw new Error('2');
                }
            }

            prevPrice = price;
            if (args.ui) await new Promise((res)=>{ setTimeout(res, 1); });
            time+=(1000*60*5); i+=1;
        } while(time <= endTime);
    }
};

module.exports = Handler;