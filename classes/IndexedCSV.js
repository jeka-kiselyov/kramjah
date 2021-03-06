const RandomAccessLinesFile = require('./RandomAccessLinesFile.js');

class IndexedCSV extends RandomAccessLinesFile {
	constructor(params) {
		super(params);

		if (!params) params = {};

		this._hasHeader = params.hasHeader || false;
		this._headerRead = false;
		this._headerKeys = [];

		this._regex = {
			// https://github.com/mholt/PapaParse/blob/master/papaparse.js
			FLOAT: /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)(e[-+]?\d+)?\s*$/,
			ISO_DATE: /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/
		};
		this._consts = {
			MAX_FLOAT: Math.pow(2, 53),
			MIN_FLOAT: -Math.pow(2, 53),
		}
	}

	async readHeader() {
		if (this._headerRead || !this._hasHeader) {
			return;
		}

		let line = await this.getFirstLine();
		this._headerKeys = line.split(',');
		this._headerRead = true;
	}

	async getFirstIndex() {
		await this.readHeader();

		const row = await this.getFirstRow();
		return row._index;
	}

	async getFirstRow() {
		await this.readHeader();

		let line = await this.getFirstLine();
		if (this._hasHeader) {
			line = await this.getNextLine();
		}

		return this.lineToRow(line);
	}

	async getNextRow() {
		await this.readHeader();

		let line = await this.getNextLine();
		return this.lineToRow(line);
	}

	async getRowByIndex(value) {
		await this.prepare(); // so we have file size
		await this.readHeader();

		let closestRow = null;
		let recursiveFunction = async(x, start, end)=>{
		    // Base Condition
		    if (start > end) return false;
			// Find the middle index
			let mid = Math.floor((start + end)/2);

			let line = await this.getLineAt(mid);
			closestRow = this.lineToRow(line);

			// console.log('Looking for ',value, 'in offset of ', mid, 'got closest index = ', closestRow._index);
		    // Compare mid with given key x
		    if (closestRow._index == x) return true;

			// If element at mid is greater than x,
			// search in the left half of mid
			if(closestRow._index > x)
				return await recursiveFunction(x, start, mid-1);
			else
				// If element at mid is smaller than x,
				// search in the right half of mid
				return await recursiveFunction(x, mid+1, end);
		}


		let start = 0;
		let end = this._size;

		await recursiveFunction(value, start, end);

		return closestRow;
	}

	async getLastIndex() {
		await this.readHeader();

		const row = await this.getLastRow();
		return row._index;
	}

	async getLastRow() {
		await this.readHeader();

		let line = await this.getLastLine();
		return this.lineToRow(line);
	}

	lineToRow(line) {
		if (!this._hasHeader) {
			return this.dynamicTypeRow(line.split(','));
		} else {
			const ret = {};
			this.dynamicTypeRow(line.split(',')).forEach((v,i)=>{ret[this._headerKeys[i]] = v; (i===0&&(ret._index = v)); });
			return ret;
		}
	}

	dynamicTypeRow(row) {
		return row.map(value=>this.dynamicTypeValue(value));
	}

	testFloat(s) {
		// https://github.com/mholt/PapaParse/blob/master/papaparse.js
		if (this._regex.FLOAT.test(s)) {
			var floatValue = parseFloat(s);
			if (floatValue > this._consts.MIN_FLOAT && floatValue < this._consts.MAX_FLOAT) {
				return true;
			}
		}
		return false;
	}

	dynamicTypeValue(value) {
		// https://github.com/mholt/PapaParse/blob/master/papaparse.js
		if (value === 'true' || value === 'TRUE')
			return true;
		else if (value === 'false' || value === 'FALSE')
			return false;
		else if (this.testFloat(value))
			return parseFloat(value);
		else if (this._regex.ISO_DATE.test(value))
			return new Date(value);
		else
			return (value === '' ? null : value);
	}

};

module.exports = IndexedCSV;