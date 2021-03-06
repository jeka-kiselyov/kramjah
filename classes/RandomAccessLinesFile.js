const fsp = require('fs').promises;

class RandomAccessLinesFile {
	constructor(params = {}) {
		this._prepared = false;
		this._filename = params.filename;
		this._size = undefined;

		this._recentLineLength = null;
		this._recentLineOffset = null;

		this._tempBufs = {};

		this._memoryBuffer = null;
		this._memoryBufferPrepared = false;
	}

	getTempBuf(size) {
		if (this._tempBufs[size]) {
			return this._tempBufs[size];
		}
		this._tempBufs[size] = new Uint8Array(size);
		return this._tempBufs[size];
	}

	async prepareMemory() {
		await this.prepare();

		this._memoryBuffer = new Uint8Array(this._size);
		await this._fp.read(this._memoryBuffer, 0, this._size, 0);
		this._memoryBufferPrepared = true;

		console.log(this._memoryBuffer.length);
	}

	async readBuf(offset, length) {
		if (this._memoryBufferPrepared) {
			let buf = this.getTempBuf(length);
			let j = 0;
			for (let i = offset; i < offset + length; i++) {
				buf[j++] = this._memoryBuffer[i];
			}
			return buf;
			// console.log('from memory');
			// return this._memoryBuffer.subarray(offset, offset + length);
		} else {
			// console.log('from file');
			let buf = this.getTempBuf(length);
			await this._fp.read(buf, 0, length, offset);

			return buf;
		}
	}

	async prepare() {
		if (this._prepared) {
			return true;
		}

		this._fp = await fsp.open(this._filename, 'r');
		const stats = await this._fp.stat();
		this._size = stats.size;
		this._prepared = true;
	}

	async close() {
		try {
			await this._fp.close();
		} catch(e) {}
		this._prepared = false;
	}

	async getLineFrom(offset) {
		// console.log('reading from ', offset);
		await this.prepare();

		if (offset > this._size - 1) {
			return '';
		}

		this._recentLineOffset = offset;

		let nlFound = false;
		let line = '';
		let chunkLength = 200;
		let maxChunks = 5;
		let curChunk = 0;

		do {
			let buf = await this.readBuf(offset, chunkLength);
			// let buf = this.getTempBuf(chunkLength);
			// await this._fp.read(buf, 0, chunkLength, offset);
			if (buf.indexOf(10) !== -1) {
				// there's nl
				nlFound = true;
			}
			line += String.fromCharCode.apply(null, buf);

			curChunk++;
		} while(!nlFound && curChunk < maxChunks);

		const lines = line.split("\n");
		this._recentLineLength = lines[0].length;

		return lines[0];
	}

	async getFirstLine() {
		await this.prepare();
		const firstLine = await this.getLineFrom(0);
		this._recentLineLength = firstLine.length;
		return firstLine;
	}

	async getNextLine() {
		if (this._recentLineLength === null) {
			return this.getFirstLine();
		}

		let offset = this._recentLineOffset + this._recentLineLength + 1;
		const line = await this.getLineFrom(offset);

		// console.log(line);

		return line;
	}

	async getLastLine() {
		await this.prepare();
		console.log('this.size', this._size);

		let chunkLength = 50;
		let maxChunkLength = 32*1024;
		let possibleOffset = this._size - chunkLength;
		let foundLast = false;

		do {
			let buf = await this.readBuf(possibleOffset, chunkLength);
			// let buf = new Uint8Array(chunkLength);
			// await this._fp.read(buf, 0, chunkLength, possibleOffset);
			buf[buf.length - 1] = 40; // be sure the last char is not \n
			// console.log(buf);

			if (buf.lastIndexOf(10) !== -1) {
				foundLast = true;
				possibleOffset = possibleOffset + buf.lastIndexOf(10);
			} else {
				chunkLength *= 2;
				possibleOffset = this._size - chunkLength;
			}
		} while(!foundLast && chunkLength < maxChunkLength);

		return this.getLineFrom(possibleOffset + 1);
	}

	async getLineAt(offset) {
		await this.prepare();

		let chunkLength = 50;
		let maxChunkLength = 32*1024;
		let possibleOffset = offset - chunkLength;
		let foundLineStart = false;

		if (possibleOffset < 0) {
			chunkLength = offset;
			possibleOffset = 0;
		}

				// console.log('possibleOffset', possibleOffset)
		do {
			let buf = await this.readBuf(possibleOffset, chunkLength);
			// let buf = new Uint8Array(chunkLength);
			// await this._fp.read(buf, 0, chunkLength, possibleOffset);
			// console.log(buf);

				// console.log('buf.lastIndexOf(10)', buf.lastIndexOf(10))
			if (buf.lastIndexOf(10) !== -1) {
				foundLineStart = true;
				possibleOffset = possibleOffset + buf.lastIndexOf(10);
			} else {
				chunkLength *= 2;
				possibleOffset = offset - chunkLength;
			}
		} while(!foundLineStart && chunkLength < maxChunkLength && possibleOffset > 0);

		if (possibleOffset < 0) {
			possibleOffset = -1;
		}

		return this.getLineFrom(possibleOffset + 1);
	}
};

module.exports = RandomAccessLinesFile;