const { Program, Command } = require('lovacli');

const path = require('path');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const ConsoleUI = require('../classes/ConsoleUI.js');

const MarketTrader = require('../classes/MarketTrader.js');
const StatsArray = require('../classes/stats/StatsArray.js');
const ObjectsToCsv = require('objects-to-csv');

class Handler extends Command {
    setup(progCommand) {
        progCommand.description('Look at history at the high speed');
        progCommand.argument('[filename]', '.dat file path with historical prices');
        progCommand.argument('[fromTime]', 'trade from timestamp, pass nothing to trade from the very begining, 0 - to trade from the begining');
        progCommand.argument('[toTime]', 'trade to timestamp, pass nothing to trade to the very end, 0 - to trade to the very end');
    }

    async handle(args, options, logger) {
        const currentPath = process.cwd();
        const filename = path.join(currentPath, args.filename);

        // logger.info('Checking integrity of .dat file: '+filename);

        let timeStart = +new Date();

        const historicalMarker = new HistoricalMarket();
        await historicalMarker.readFromFile(filename);
        historicalMarker.disableCSV();

        let timeEnd = +new Date();
        // logger.info('Loaded in '+(timeEnd - timeStart)+' ms');

        let historicalStartTime = historicalMarker.getStartTime();
        let historicalEndTime = historicalMarker.getEndTime();
        let startTime = historicalStartTime;
        let endTime = historicalEndTime;

        let curTimeInSeconds = (+new Date())/1000;
        if (args.fromTime && args.fromTime != '0') {
            startTime = parseInt(args.fromTime, 10);
            if (startTime > curTimeInSeconds) {
                // passed in milliseconds, all is fine
            } else {
                startTime = Math.floor(startTime * 1000);
            }
        }

        if (args.toTime & args.toTime != '0') {
            endTime = parseInt(args.toTime, 10);
            if (endTime > curTimeInSeconds) {
                // passed in milliseconds, all is fine
            } else {
                endTime = Math.floor(endTime * 1000);
            }
        }

        if (startTime < historicalStartTime) {
            logger.info('Correcting start time');
        }
        if (endTime > historicalEndTime) {
            logger.info('Correcting end time');
        }

        // logger.info('Doing market trading simulation...');
        // logger.info(' from '+new Date(startTime));
        // logger.info('   to '+new Date(endTime));

        const pricesOnFeatures = {};

        let price = null;
        let time = startTime; // startTime + (1000*60*5)*120;
        let i = 0;
        do {
            try {
                price = await historicalMarker.getPriceAt(time);

                const intervalMIN15 = await price.getInterval(HistoricalMarket.INTERVALS.MIN15);
                // const shiftsMIN15 = await intervalMIN15.getShifts(1);
                // shiftsMIN15.pop();

                // const features = shiftsMIN15.map((s)=>{
                //     return s.toFixed( Math.ceil(Math.abs(Math.log10(2))) );
                // });

                const trueRangePercent = await intervalMIN15.getAverageTrueRangePercent();

                const features = [trueRangePercent.toFixed(1)];

                const featuresKey = features.join('|');

                for (let fKey in pricesOnFeatures) {
                    for (let fItem of pricesOnFeatures[fKey]) {
                        if (!fItem.filled && fItem.price < price.high) {
                            fItem.filled = true;
                            fItem.filledTime = (time - fItem.time) / 1000;
                            // console.log('Filled ', fItem.price);
                        }
                    }
                }

                if (!pricesOnFeatures[featuresKey]) {
                    pricesOnFeatures[featuresKey] = [];
                }

                const expectedPriceToSell = (0+price.price) * 1.01;
                const item = {
                    time: (0 + time),
                    price: expectedPriceToSell,
                    filled: false,
                };

                pricesOnFeatures[featuresKey].push( item );
            } catch(e) {

            }

            // logger.info(price.price, time);

            time+=(1000*60*5); i+=1;
        } while(time <= endTime);

        const results = [];

        for (let fKey in pricesOnFeatures) {
            const normalized = fKey.split('|');
            const r = {
                averageVolatility: normalized[0],
                // shift2: normalized[1],
                // shift3: normalized[2],
                // shift4: normalized[3],
            };

            const allCount = pricesOnFeatures[fKey].length;
            let filledCount = 0;
            let filledTimes = 0;

            const filledTimesStats = new StatsArray();

            pricesOnFeatures[fKey].forEach((i)=>{
                if (i.filled) {
                    filledCount++;
                    filledTimes+=i.filledTime;

                    filledTimesStats.push(i.filledTime);
                }
            });

            // if (filledCount) {
            //     r.avgFilledTime2 = Math.floor( filledTimes / filledCount );
            //     r.avgFilledTimeLog = Math.round(Math.log10(r.avgFilledTime));
            // } else {
            //     r.avgFilledTime2 = '';
            //     r.avgFilledTimeLog = '';
            // }

            r.avgFilledTime = filledTimesStats.mean();
            r.q5FilledTime = filledTimesStats.quantile(.50);
            r.q25FilledTime = filledTimesStats.quantile(.25);
            r.q75FilledTime = filledTimesStats.quantile(.75);
            r.q95FilledTime = filledTimesStats.quantile(.95);

            r.allCount = allCount;
            r.filledCount = filledCount;
            r.filledPercent = ((filledCount / allCount)*100).toFixed(5);

            results.push(r);
        }

        const csv = new ObjectsToCsv(results);
        console.log(await csv.toString());
    }
};

module.exports = Handler;