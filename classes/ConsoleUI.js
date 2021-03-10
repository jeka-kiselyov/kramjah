const asciichart = require ('asciichart');
const moment = require('moment');
const chalk = require('chalk');
const Table = require('cli-table3');
const HistoricalMarket = require('../classes/HistoricalMarket.js');
const READLINE = require('readline');
const blessed = require('blessed');

class ConsoleUI {
	constructor(params = {}) {
	}

	static setDataFromMarketTrader(marketTrader) {
		this._quantityIncrement = marketTrader._quantityIncrement;
		this._tickSize = marketTrader._tickSize;
		this._baseCurrency = marketTrader._baseCurrency;
		this._quoteCurrency = marketTrader._quoteCurrency;

		if (marketTrader._lastRunPriceCombined) {
			this._lastPrice = marketTrader._lastRunPriceCombined.price;
		} else {
			this._lastPrice = '';
		}
	}

	// static setQuantityIncrement(quantityIncrement) {
	// 	this._quantityIncrement = quantityIncrement;
	// }

	// static setTickSize(tickSize) {
	// 	this._tickSize = tickSize;
	// }

	// static setLastPrice(price) {
	// 	this._lastPrice = price;
	// }

	// static setBaseCurrency(currency) {
	// 	this._baseCurrency = currency;
	// }

	// static setQuoteCurrency(currency) {
	// 	this._quoteCurrency = currency;
	// }

	static initialize() {
		this._lastPrice = 0;

		this._screen = blessed.screen({
			smartCSR: true
		});

		this._chartBox = blessed.box({
			align: 'right',
			top: 'top',
			left: 'center',
			width: '100%',
			height: '50%',
			content: 'Hello {bold}world{/bold}!',
			tags: true,
			border: {
			type: 'line'
			},
			style: {
			fg: 'white',
			bg: 'black',
			border: {
				fg: '#f0f0f0'
			},
			hover: {
				bg: 'green'
			}
			}
			});

		this._activeBidsBox = blessed.ListTable({
			align: 'left',
			top: '50%',
			left: 'left',
			width: '30%',
			height: '50%',
			content: '',
			tags: true,
			border: {
			type: 'line'
			},
			noCellBorders: true,
			style: {
			fg: 'white',
			bg: 'black',
			border: {
				fg: '#f0f0f0'
			},
			hover: {
				bg: 'green'
			}
			}
			});

		this._closedBidsBox = blessed.ListTable({
			interactive: false,
			align: 'left',
			top: '50%',
			left: '30%',
			width: '20%',
			height: '50%',
			content: '',
			tags: true,
			border: {
			type: 'line'
			},
			noCellBorders: true,
			style: {
			border: {
				fg: '#f0f0f0'
			},
			hover: {
				bg: 'green'
			}
			}
			});


		this._traderBox = blessed.Table({
			align: 'left',
			top: '50%',
			left: '50%',
			width: '50%',
			height: '50%',
			content: '',
			tags: true,
			border: {
			type: 'line'
			},
			noCellBorders: false,
			style: {
			fg: 'white',
			bg: 'black',
			border: {
				fg: '#f0f0f0'
			},
			hover: {
				bg: 'green'
			}
			}
			});

		// Append our box to the screen.
		this._screen.append(this._chartBox);
		this._screen.append(this._activeBidsBox);
		this._screen.append(this._closedBidsBox);
		this._screen.append(this._traderBox);

		// Quit on Escape, q, or Control-C.
		this._screen.key(['escape', 'q', 'C-c'], function(ch, key) {
			return process.exit(0);
		});

		this._chartBox.setLabel({text:'Price Chart',side:'left'});
		this._activeBidsBox.setLabel({text:'Pending Bids',side:'left'});
		this._closedBidsBox.setLabel({text:'Closed Bids',side:'left'});
		this._traderBox.setLabel({text:'Trader',side:'left'});

		// setLabel(text/options) - Set the label text for the top-left corner. Example options: {text:'foo',side:'left'}

		// this._screen.render();
	}

	static swawBuffers() {
  //   READLINE.cursorTo(process.stdout, 0, 0);
  //   READLINE.clearLine(process.stdout, 0);
  //   READLINE.clearScreenDown(process.stdout);
		// process.stdout.write(this._buffer);
		// this._buffer = '';
		this._buffer = '';
		this._screen.render();
	}

	static out(string) {
		this._buffer += string;
		this._buffer += "\n";
	}

	static currencyFormat(value) {
		return (value.toFixed(Math.ceil(Math.abs(Math.log10(this._tickSize)))));
	}

	static itemValueFormat(value) {
		return (value.toFixed(Math.ceil(Math.abs(Math.log10(this._quantityIncrement)))));
	}

	static async drawMarketTrader(marketTrader) {
		const portfolioPrice = marketTrader.getEstimatedPortfolioPrice();
		const ifWouldHODLPortfolioPrice = marketTrader.getIfWouldHODLPortfolioPrice();

		// const statsTable = new Table({
		// 	head: ['Profit', 'Operating Balance', 'Blocked Balance', 'Item Balance', 'Estimated Balance'],
		// 	chars: {'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': ''},
		// 	});

		const statsRows = [];
		statsRows.push(['Profit', this.currencyFormat(marketTrader.profitBalance)]);
		statsRows.push(['Estimated Balance', this.currencyFormat(portfolioPrice)]);
		statsRows.push(['If Would HODL', this.currencyFormat(ifWouldHODLPortfolioPrice)]);
		statsRows.push(['Operating Balance', this.currencyFormat(marketTrader.operatingBalance)]);
		statsRows.push(['Blocked Balance', this.currencyFormat(marketTrader.blockedBalance)]);
		statsRows.push(['Item Balance', this.itemValueFormat(marketTrader.itemBalance)]);
		// statsRows.push(['Profit', 'Operating Balance', 'Blocked Balance', 'Item Balance', 'Estimated Balance']);

		// statsRows.push([
		// 		this.currencyFormat(marketTrader.profitBalance),
		// 		this.currencyFormat(marketTrader.operatingBalance),
		// 		this.currencyFormat(marketTrader.blockedBalance),
		// 		this.itemValueFormat(marketTrader.itemBalance),
		// 		this.currencyFormat(portfolioPrice),
		// 	]);

		this._traderBox.setData(statsRows);

		// this.out(statsTable.toString());
		// this.out('bidWorkers: '+marketTrader._bidWorkers.length+' closed bids: '+marketTrader._closedBids.length+' profit: '+marketTrader.profitBalance+' op balance: '+marketTrader.operatingBalance+' portfolio:'+portfolioPrice);

		// const table = new Table({
		// 	head: ['Pending', 'Closed'],
		// 	chars: {'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': ''},
		// 	});


		let waitingForSellCount = 0;
		let waitingForBuyCount = 0;
		let pendingBids = [];
		for (let bidWorker of marketTrader._bidWorkers) {
			let color = null;
			if (bidWorker.isWaitingForBuy()) {
				color = 'green';
				waitingForBuyCount++;
			} else if (bidWorker.isWaitingForSell()) {
				color = 'red';
				waitingForSellCount++;
			}

			if (color) {
				if (color == 'red') {
					pendingBids.push({amount: this.currencyFormat(bidWorker._operatingBalance), value: bidWorker._waitingForPrice, string: ''+chalk[color](this.currencyFormat(bidWorker._waitingForPrice))+' '+this.currencyFormat(bidWorker._originalTargetPrice)});
				} else {
					let string = chalk[color](this.currencyFormat(bidWorker._waitingForPrice))+' '+this.currencyFormat(bidWorker._gonnaPay)+' '+this.itemValueFormat(bidWorker._gonnaBuy);
					pendingBids.push({amount: this.currencyFormat(bidWorker._operatingBalance), value: bidWorker._waitingForPrice, string: string});
				}

			}
		}

		pendingBids.sort(function (a, b) {
			return b.value - a.value;
		});

		// if there're too much waiting for sell - merge first N rows to single one
		let mergeWaitingForSellCount = waitingForSellCount - 10;
		if (mergeWaitingForSellCount > 1) {
			let stringStart = ''+this.currencyFormat(pendingBids[0].value);
			let stringEnd = ''+this.currencyFormat(pendingBids[mergeWaitingForSellCount - 1].value);

			let mergedString = ''+stringStart+' ... '+stringEnd+' ('+mergeWaitingForSellCount+' items)';

			pendingBids.splice(0, mergeWaitingForSellCount);
			pendingBids.unshift({value: null, string: chalk.red(mergedString), amount: ''});
		}

		let mergeWaitingForBuyCount = waitingForBuyCount - 10;
		if (mergeWaitingForBuyCount > 1) {
			let stringStart = ''+this.currencyFormat(pendingBids[pendingBids.length - 1].value);
			let stringEnd = ''+this.currencyFormat(pendingBids[pendingBids.length - mergeWaitingForBuyCount].value);

			let mergedString = ''+stringStart+' ... '+stringEnd+' ('+mergeWaitingForBuyCount+' items)';
			pendingBids.splice(pendingBids.length - mergeWaitingForBuyCount, mergeWaitingForBuyCount + 1);
			pendingBids.push({value: null, string: chalk.green(mergedString), amount: ''});
		}

		let activeBidsRows = [];
		for (let pendingBid of pendingBids) {
			activeBidsRows.push([pendingBid.string, pendingBid.amount]);
		}
		this._activeBidsBox.setData(activeBidsRows);


		let i = 0;
		let closedBidsRows = [];
		for (let closedBid of marketTrader._closedBids) {
			if (i < 25) {
				if (closedBid.isBought()) {
					closedBidsRows.push(['{green-fg}'+this.currencyFormat(closedBid.atPrice)+'{/}']);
				} else {
					closedBidsRows.push(['{red-fg}'+this.currencyFormat(closedBid.atPrice)+'{/}'+' {green-fg}+'+this.currencyFormat(closedBid.profit)+'{/}']);
				}
			} else {
				break;
			}

			i++;
		}

		this._closedBidsBox.setData(closedBidsRows);

// // table is an Array, so you can `push`, `unshift`, `splice` and friends
// table.push(
//     ['First value', 'Second value']
//   , ['First value', 'Second value']
// );

		// this.out(table.toString());
	}

	static async drawTimePrice(price) {
		const displayPrevPricesShift = true;
		let maxPrevPrices = 140;

		const values = new Array(maxPrevPrices);
		const times = new Array(maxPrevPrices);

		let dateFrom = null;
		let dateTo = null;
		let prevPrice = price;
		for (let i = 0; i < maxPrevPrices; i++) {
			values[maxPrevPrices - 1 - i] = prevPrice.price;
			if (!dateTo) {
				dateTo = moment(new Date(prevPrice.time));
			}

			prevPrice = await prevPrice.getPrev();
		}
		dateFrom = moment(new Date(prevPrice.time));

		// if (displayPrevPricesShift) {
		// 	const shifts = await price.getShifts(48);
		// 	let shiftsStringMIN5 = this.shiftsToString(shifts);

		// 	const intervalHOUR1 = await price.getInterval(HistoricalMarket.INTERVALS.HOUR1);
		// 	const shiftsHOUR1 = await intervalHOUR1.getShifts(24);
		// 	let shiftsStringHOUR1 = this.shiftsToString(shiftsHOUR1);

		// 	const intervalDAY1 = await price.getInterval(HistoricalMarket.INTERVALS.DAY1);
		// 	const shiftsDAY1 = await intervalDAY1.getShifts(7);
		// 	let shiftsStringDAY1 = this.shiftsToString(shiftsDAY1);

		// 	const intervalWEEK1 = await price.getInterval(HistoricalMarket.INTERVALS.WEEK1);
		// 	const shiftsWEEK1 = await intervalWEEK1.getShifts(4);
		// 	let shiftsStringWEEK1 = this.shiftsToString(shiftsWEEK1);
		// }


		// this.out(chalk.green(this.justifyString(160, dateFrom.format('     MMMM Do YYYY, HH:mm'), dateTo.format('MMMM Do YYYY, HH:mm') )));
		// this.out(asciichart.plot (values, { height: 20, offset: 2 }));


		this._chartBox.setLabel({text: ''+this._baseCurrency+'/'+this._quoteCurrency+' - 5 minutes interval - '+dateTo.format('MMMM Do YYYY, HH:mm')+' : '+this._lastPrice,side:'left'});

		let content = asciichart.plot (values, { height: 20, offset: 2 });
		if (displayPrevPricesShift) {
			const shifts = await price.getShifts(48);
			let shiftsStringMIN5 = this.shiftsToString(shifts);

			const intervalMIN15 = await price.getInterval(HistoricalMarket.INTERVALS.MIN15);
			const shiftsMIN15 = await intervalMIN15.getShifts(8);
			let shiftsStringMIN15 = this.shiftsToString(shiftsMIN15);

			const intervalHOUR1 = await price.getInterval(HistoricalMarket.INTERVALS.HOUR1);
			const shiftsHOUR1 = await intervalHOUR1.getShifts(24);
			let shiftsStringHOUR1 = this.shiftsToString(shiftsHOUR1);

			const intervalDAY1 = await price.getInterval(HistoricalMarket.INTERVALS.DAY1);
			const shiftsDAY1 = await intervalDAY1.getShifts(7);
			let shiftsStringDAY1 = this.shiftsToString(shiftsDAY1);

			const intervalWEEK1 = await price.getInterval(HistoricalMarket.INTERVALS.WEEK1);
			const shiftsWEEK1 = await intervalWEEK1.getShifts(4);
			let shiftsStringWEEK1 = this.shiftsToString(shiftsWEEK1);

			content += "\n";
			content += 'W1:'+shiftsStringWEEK1+' D1:'+shiftsStringDAY1+' H1:'+shiftsStringHOUR1+' M15:'+shiftsStringMIN15+' M5:'+shiftsStringMIN5;
			// content += 'W1'+shiftsStringWEEK1+'D1'+shiftsStringDAY1+'H1'+shiftsStringHOUR1+'M5'+shiftsStringMIN5;
		}


		this._chartBox.setContent(content);

		// this.out('W1'+shiftsStringWEEK1+'D1'+shiftsStringDAY1+'H1'+shiftsStringHOUR1+'M5'+shiftsStringMIN5);
	}

	static shiftsToString(shifts) {
		let shiftsString = '';

		for (let i = shifts.length - 1; i>=0; i--) {
			let shift = shifts[i];
			let strVal = Math.abs(Math.floor(shift));
			if (strVal > 9) strVal = 9;
			if (shift < 0) {
				shiftsString+=chalk.black.bgRed(strVal);
			} else {
				shiftsString+=chalk.black.bgGreen(strVal);
			}
		}

		return shiftsString;
	}

	static justifyString(length, startString, endString) {
		return '' + startString.padEnd(length - startString.length - endString.length) + endString;
	}
};

module.exports = ConsoleUI;