'use strict'

const t = require('tap');
const { test } = t;

const path = require('path');

const HistoricalMarket = require('../classes/HistoricalMarket.js');
const HistoricalMarketPriceCombined = require('../classes/HistoricalMarketPriceCombined.js');

test('setup', async t => {
});

test('Sample test', async t => {
	t.ok(true);
	t.equal(1, 1, 'Equals');
});

test('Check adding new price in realtime', async t=>{
	const historicalMarket = new HistoricalMarket({filename: path.join(__dirname, '../../data/btcusd.csv'), hasHeader: true});
	let addPriceToTime = 1613943362000; // 2021-02-21T21:36:02+00:00

	// put all 3 prices to same 15 minutes interval

	addPriceToTime -= 5 * 60 * 1000;

	let data = {
		time: addPriceToTime,
		high: 60000,
		low: 59000,
		open: 59000,
		close: 60000,
		volume: 10,
	};

	await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(data);

	addPriceToTime += 5 * 60 * 1000;

	data = {
		time: addPriceToTime,
		high: 61000,
		low: 60000,
		open: 59000,
		close: 61000,
		volume: 10,
	};

	await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(data);

	let p1 = await historicalMarket.getPriceAt(addPriceToTime - 5 * 60 * 1000);
	let p2 = await historicalMarket.getPriceAt(addPriceToTime);

	t.equal(p1.price, 59500, 'Price 1 added ok');
	t.equal(p2.price, 60500, 'Price 2 added ok');

	let higherInterval = await p1.getHigherInterval();
	t.equal(higherInterval.price, 60000, 'Higher interval updated ok');

	let p1isFull = p1.isFull();
	let p2isFull = p2.isFull();
	let hiisFull = higherInterval.isFull();
	t.equal(p1isFull, true, 'Lowest prices are full and ready to be cached');
	t.equal(p2isFull, true, 'Lowest prices are full and ready to be cached');
	t.equal(hiisFull, false, 'Higher interval is not full, as there re not enough lower interval prices');


	addPriceToTime += 5 * 60 * 1000;

	data = {
		time: addPriceToTime,
		high: 62000,
		low: 61000,
		open: 59000,
		close: 62000,
		volume: 10,
	};

	await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(data);

	t.equal(higherInterval.price, 60500, 'Higher interval updated ok again');

	hiisFull = higherInterval.isFull();
	t.equal(hiisFull, true, 'Higher interval is full now and ready to be cached');

	let higherHigherInterval = await higherInterval.getHigherInterval();
	let hihiisFull = higherHigherInterval.isFull();
	t.equal(hihiisFull, false, 'Higher higher interval is still not full');


	addPriceToTime += 5 * 60 * 1000;

	data = {
		time: addPriceToTime,
		high: 62000,
		low: 61000,
		open: 59000,
		close: 62000,
		volume: 10,
	};
	await historicalMarket.pushLowestCombinedIntervalRAWAndRecalculateParents(data);

	hihiisFull = higherHigherInterval.isFull();
	t.equal(hihiisFull, false, 'Higher higher interval is still not full');

	t.equal(higherHigherInterval._prices.length, 2);
});

test('teardown', async t=>{
});