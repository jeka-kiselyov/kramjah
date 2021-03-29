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

	static clear() {
		this._screen.realloc();
	}

	static setDataFromSymbolInfo(symbolInfo) {
		this._quoteCurrency = symbolInfo.quoteCurrency;
		this._baseCurrency = symbolInfo.baseCurrency;
		this._quantityIncrement = symbolInfo.quantityIncrement;
		this._tickSize = symbolInfo.tickSize;
	}

	static setDataFromMarketTrader(marketTrader) {
		this._marketTrader = marketTrader;

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

	static setLastPrice(value) {
		this._lastPrice = value;
	}

	static async redrawTimePriceStats(option) {
		this._statsOption = option;
		await this.drawTimePrice();
		this.swawBuffers();
	}

	static debug(...fArgs) {
		let d = new Date();


	    this._screen.debug.apply(this._screen, fArgs);
		// this._screen.debug(''+d.toTimeString().split(' ')[0]+' | '+string);
	}

	static wasPausePressed() {
		if (this._pausePressed) {
			if ((new Date()).getTime() - this._pausePressedAt.getTime() < 30000) { // keep pause for 30 seconds
				return true;
			} else {
				this._pausePressed = false;
				this._pausePressedAt = null;
			}
		}

		return false;
	}

	static initialize() {
		this._quantityIncrement = 0.00001;
		this._tickSize = 0.00001;

		this._lastPrice = 0;
		this._statsOption = '1';

		this._screen = blessed.screen({
			smartCSR: true,
			debug: true,
		});

	    this._screen.key('l', ()=>{
	    	this._screen.debugLog.toggle();
	    });

		this._screen.key('p', ()=>{
			this._pausePressed = true;
			this._pausePressedAt = new Date();
		});

		this._screen.key('up', ()=>{
			this.drawNextMarketTrader();
			this._pausePressed = true;
			this._pausePressedAt = new Date();
		});

		this._screen.key('down', ()=>{
			this.drawPrevMarketTrader();
			this._pausePressed = true;
			this._pausePressedAt = new Date();
		});

		this._screen.key('1', ()=>{ this.redrawTimePriceStats('1'); });
		this._screen.key('2', ()=>{ this.redrawTimePriceStats('2'); });
		this._screen.key('3', ()=>{ this.redrawTimePriceStats('3'); });

		this._screen.key('4', ()=>{ this.redrawTimePriceStats('4'); });
		this._screen.key('5', ()=>{ this.redrawTimePriceStats('5'); });
		this._screen.key('6', ()=>{ this.redrawTimePriceStats('6'); });

		this._screen.key('7', ()=>{ this.redrawTimePriceStats('7'); });
		// this._screen.key('2', async()=>{ console.log(2); this._statsOption = '2'; await this.drawTimePrice(); this.swawBuffers(); });
		// this._screen.key('3', async()=>{console.log(3);  this._statsOption = '3'; await this.drawTimePrice(); this.swawBuffers(); });
		// this._screen.key('4', ()=>{ this._statsOption = '4'; this.drawTimePrice(); });

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

		this._initialized = true;
	}

	static isInitialized() {
		if (this._initialized) {
			return true;
		}

		return false;
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
		if (!marketTrader.lastRunPriceCombined) {
			return false;
		}

		await this.setDataFromMarketTrader(marketTrader);
		await this.drawTimePrice(marketTrader.lastRunPriceCombined);

		const portfolioPrice = marketTrader.getEstimatedPortfolioPrice();
		const ifWouldHODLPortfolioPrice = marketTrader.getIfWouldHODLPortfolioPrice();

		const possibleBuyBids = await marketTrader.getPossibleBuyBidsCount();
		const availCurrency = await marketTrader.getAvailableCurrency();

		const statsRows = [];
		statsRows.push(['Profit', this.currencyFormat(marketTrader.profitBalance)]);
		statsRows.push(['Estimated Balance', this.currencyFormat(portfolioPrice)]);
		statsRows.push(['If Would HODL', this.currencyFormat(ifWouldHODLPortfolioPrice)]);
		statsRows.push(['Operating Balance', this.currencyFormat(marketTrader.operatingBalance)]);
		statsRows.push(['Blocked Balance', this.currencyFormat(marketTrader.blockedBalance)]);
		statsRows.push(['Item Balance', this.itemValueFormat(marketTrader.itemBalance)]);
		statsRows.push(['Open Buy Bids', ''+marketTrader.getOpenBuyBidsCount()]);
		statsRows.push(['Possible Buy Bids', ''+possibleBuyBids]);
		statsRows.push(['Used Currency', this.currencyFormat(marketTrader.getUsedCurrency())]);
		statsRows.push(['Avail Currency', this.currencyFormat(availCurrency)]);

		this._traderBox.setData(statsRows);


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
		this._screen.render();
	}

	static setMarketTraders(marketTraders) {
		this._marketTraders = marketTraders;
	}

	static drawPrevMarketTrader() {
		let cKeyIndex = Object.keys(this._marketTraders).indexOf(this._marketTraderKeyToRender);
		cKeyIndex--;
		if (cKeyIndex < 0) {
			cKeyIndex = Object.keys(this._marketTraders).length - 1;
		}
		this._marketTraderKeyToRender = Object.keys(this._marketTraders)[cKeyIndex];

		this.drawMarketTrader(this._marketTraders[this._marketTraderKeyToRender]);
	}

	static drawNextMarketTrader() {
		let cKeyIndex = Object.keys(this._marketTraders).indexOf(this._marketTraderKeyToRender);
		cKeyIndex++;
		if (Object.keys(this._marketTraders).length <= cKeyIndex) {
			cKeyIndex = 0;
		}
		this._marketTraderKeyToRender = Object.keys(this._marketTraders)[cKeyIndex];

		this.drawMarketTrader(this._marketTraders[this._marketTraderKeyToRender]);
	}

	static scheduleMarketTradersLoop() {
		this._marketTraderKeyToRender = Object.keys(this._marketTraders)[0];
		setInterval(()=>{
			if (!this.wasPausePressed()) {
				this.drawNextMarketTrader();
			} else {
				this.drawMarketTrader(this._marketTraders[this._marketTraderKeyToRender]);
			}
		}, 10000);
	}

	static async drawTimePrice(price) {
		if (!price) {
			price = this._lastDisplayedPriceCombined;
		}
		this._lastDisplayedPriceCombined = price;

		const displayPrevPricesShift = true;

		let dateTo = moment(new Date(price.time));
		let combinedPriceForTheChart = price;
		let chartLabel = '5 minutes interval';
		if (this._statsOption == '2') {
			combinedPriceForTheChart = await price.getInterval(HistoricalMarket.INTERVALS.MIN15);
			chartLabel = '15 minutes interval';
		}
		if (this._statsOption == '3') {
			combinedPriceForTheChart = await price.getInterval(HistoricalMarket.INTERVALS.HOUR1);
			chartLabel = '1 hour interval';
		}
		if (this._statsOption == '4') {
			combinedPriceForTheChart = await price.getInterval(HistoricalMarket.INTERVALS.MIN5);
			chartLabel = '5 minutes interval True Range Percents';
		}
		if (this._statsOption == '5') {
			combinedPriceForTheChart = await price.getInterval(HistoricalMarket.INTERVALS.MIN15);
			chartLabel = '15 minutes interval True Range Percents';
		}
		if (this._statsOption == '6') {
			combinedPriceForTheChart = await price.getInterval(HistoricalMarket.INTERVALS.HOUR1);
			chartLabel = '1 hour interval True Range Percents';
		}

		let maxPrevPrices = 140;

		const values = new Array(maxPrevPrices);
		const highs = new Array(maxPrevPrices);
		const lows = new Array(maxPrevPrices);

		let dateFrom = null;
		let prevPrice = combinedPriceForTheChart;
		for (let i = 0; i < maxPrevPrices; i++) {
			if (this._statsOption == '4' || this._statsOption == '5' || this._statsOption == '6') {
				values[maxPrevPrices - 1 - i] = await prevPrice.getAverageTrueRangePercent();
			} else {
				values[maxPrevPrices - 1 - i] = prevPrice.price;
				highs[maxPrevPrices - 1 - i] = prevPrice.high;
				lows[maxPrevPrices - 1 - i] = prevPrice.low;
			}

			prevPrice = await prevPrice.getPrev();
		}
		dateFrom = moment(new Date(prevPrice.time));

		this._chartBox.setLabel({text: ''+this._baseCurrency+'/'+this._quoteCurrency+' - '+chartLabel+' - '+dateTo.format('MMMM Do YYYY, HH:mm')+' : '+this._lastPrice,side:'left'});

		let chartData = values;
		if (this._statsOption == '1' || this._statsOption == '2' || this._statsOption == '3') {
			chartData = [lows, highs];
		}

		let content = asciichart.plot(chartData,
			{
				height: 20,
				offset: 2,
			    format:  (x, i)=>{
			    	let length = Math.ceil(Math.abs(Math.log10(this._tickSize)));
			    	let totalLength = length + 5 + 1;
			    	return (' '.repeat(totalLength) + x.toFixed(length)).slice(-totalLength);
			    },
			    colors: [
			        asciichart.red,
			        asciichart.green,
			        asciichart.blue,
			        undefined, // equivalent to default
			    ],
			});

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

		content += "\n";
		content += '[1] - [6] - change view';

		if (this._marketTraders) {
			content += ' | [p] - pause current | [up][down] - switch traders';
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