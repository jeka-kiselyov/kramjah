'use strict'

const t = require('tap');
const { test } = t;

const path = require('path');

const HitBtc = require('../classes/markets/HitBtc.js');
const MarketStatistics = require('../classes/MarketStatistics.js');
let trading = null;


test('setup', async t => {
});

test('Sample test', async t => {
	t.ok(true);
	t.equal(1, 1, 'Equals');
});

const sameFloat = (t, float1, float2)=>{
	const normalizedFloat1 = parseFloat(''+float1).toFixed(8);
	const normalizedFloat2 = parseFloat(''+float2).toFixed(8);

	t.same(normalizedFloat1, normalizedFloat2);
};

test('Check MarketStatistics works', async t=>{
	const marketStatistics = new MarketStatistics();
	const estimatedBalances = await marketStatistics.getEstimatedAccountBalance();

	t.ok(estimatedBalances);
	t.ok(estimatedBalances.BTC.total > 0);
	t.ok(estimatedBalances.USD.total > 0);
	t.ok(estimatedBalances.BTC.price > 0);

	const evaluation = await marketStatistics.evaluateSymbol('BTCUSD');

	t.ok(evaluation.symbol);
	t.same(evaluation.symbol, 'BTCUSDT');
	t.same(evaluation.baseCurrency, 'BTC');
	t.same(evaluation.quoteCurrency, 'USDT');
	t.ok(evaluation.priceOnStart);
	t.ok(evaluation.priceOnEnd);
	t.ok(evaluation.medianVolume);
	t.ok(evaluation.pricesToSoldCovered);

});

test('Check class is ok', async t=>{
	/// Initialize an instance,
	/// get current ETHBTC price
	/// place buy order with price = 90% of current price
	/// and cancels it immediately
	///
	const testQuantity = 0.01;
	const testPriceK = 0.9;
	const symbol = 'ETHBTC';

	t.ok(HitBtc);

	trading = HitBtc.getSingleton(true);
	t.ok(trading);

	// get most recent ETHBTC price
	const tickerETHBTC = await trading.getTicker(symbol);
	t.ok(tickerETHBTC);
	t.ok(tickerETHBTC.price);

	const orderTargetPrice = tickerETHBTC.price * testPriceK; // place buy order with price lower than market
	const orderTargetPriceNormalized = await trading.normalizePrice(orderTargetPrice, symbol);

	const oderQuantityNormalized = await trading.normalizeQuantity(testQuantity, symbol); /// should be the same with this test value

	t.same(oderQuantityNormalized, testQuantity);

	t.ok(orderTargetPrice > 0);
	t.ok(orderTargetPrice > 0);

	const order = await trading.placeOrder({
		symbol: symbol,
		side: 'buy',
		price: orderTargetPriceNormalized,
		quantity: oderQuantityNormalized,
	});

	t.ok(order); /// this is just the socket response, not the real object in our memory (@todo?)
	t.ok(order.clientOrderId);

	// and check there's order added to our memory via socket notifications:
	const orderAdded = await trading.getOrderByClientOrderIdWithCache({
		clientOrderId: order.clientOrderId,
	});

	t.ok(orderAdded);
	t.ok(orderAdded.status == 'new');
	t.same(orderAdded.quantity, testQuantity); // same - ==, as response quantity is a string
	t.same(orderAdded.price, orderTargetPriceNormalized);

	const success = await trading.cancelOrder({
		clientOrderId: order.clientOrderId
	});

	t.ok(success);

	await new Promise((res)=>{ setTimeout(res, 100); }); // wait for some time
	/// but actually we should got notification before response to await trading.cancelOrder
	/// so there's really no need to wait (in theory)

	const orderThere = await trading.getOrderByClientOrderIdWithCache({
		clientOrderId: order.clientOrderId,
	});

	t.ok(orderThere);
	t.ok(orderThere.status == 'canceled'); // should be updated via socket notifications (not directly)


	trading.close();
});


test('Check class work with balances', async t=>{
	/// Initialize an instance,
	/// get current ETHBTC price
	/// place buy order with price = 90% of current price
	/// and cancels it immediately
	///
	const testMoveQuantity = 0.02;
	const testMoveCurrency ='USD';

	t.ok(HitBtc);

	trading = HitBtc.getSingleton(true);
	t.ok(trading);

	const tradingBalance = await trading.getTradingBalance(); // SPOT wallet
	const accountBalance = await trading.getAccountBalance(); // Account WALLET

	t.equal(tradingBalance['BTC'].available + tradingBalance['BTC'].reserved, tradingBalance['BTC'].total);
	t.equal(tradingBalance['USDT'].available + tradingBalance['USDT'].reserved, tradingBalance['USDT'].total);

	// There should be USD helper (copied from USDT)
	t.equal(tradingBalance['USD'].available + tradingBalance['USD'].reserved, tradingBalance['USD'].total);
	t.equal(tradingBalance['USD'].available, tradingBalance['USDT'].available);
	t.equal(tradingBalance['USD'].reserved, tradingBalance['USDT'].reserved);
	t.equal(tradingBalance['USD'].total, tradingBalance['USDT'].total);

	console.log(tradingBalance);
	console.log(accountBalance);

	// transfer 0.001 BTC from Wallet to Spot
	const moveToSpotSuccess = await trading.transferToTradingBalance({
		currency: testMoveCurrency,
		amount: testMoveQuantity,
	});
	t.ok(moveToSpotSuccess);

	await new Promise((res)=>{ setTimeout(res, 500); }); // some delay to be sure caches updated on exchange

	const accountBalanceTraded = await trading.getAccountBalance(); // Account WALLET

	sameFloat(t, accountBalanceTraded[testMoveCurrency].available, accountBalance[testMoveCurrency].available - testMoveQuantity);

	const tradingBalanceTraded = await trading.getTradingBalance(); // SPOT wallet

	sameFloat(t, tradingBalanceTraded[testMoveCurrency].available, tradingBalance[testMoveCurrency].available + testMoveQuantity);

	// transfer 0.001 BTC from Spot to Wallet
	const moveSuccess = await trading.transferFromTradingBalance({
		currency: testMoveCurrency,
		amount: testMoveQuantity,
	});

	t.ok(moveSuccess);

	await new Promise((res)=>{ setTimeout(res, 500); }); // some delay to be sure caches updated on exchange

	const accountBalanceUpdated = await trading.getAccountBalance(); // Account WALLET

	t.same(accountBalanceUpdated[testMoveCurrency].available, accountBalance[testMoveCurrency].available);

	const tradingBalanceUpdated = await trading.getTradingBalance(); // SPOT wallet

	t.same(tradingBalanceUpdated[testMoveCurrency].available, tradingBalance[testMoveCurrency].available);





	trading.close();
});

test('teardown', async t=>{
	trading.close();


	const tradingInstance = HitBtc.getSingleton(false);
	tradingInstance.close();
});