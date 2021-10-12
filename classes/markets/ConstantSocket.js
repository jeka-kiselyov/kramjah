const WebSocket = require('ws');
const moment = require('moment');
const axios = require('axios');
require('dotenv').config();

const EventEmitter = require('events');

class ConstantSocket extends EventEmitter {
	constructor(params = {}) {
		super();

		this._logger = params.logger || null;

		this._timeout = 10000;
		this._url = params.url;;
	}

	setLogger(logger) {
		this._logger = logger;
		if (this._publicSocket) {
			this._publicSocket.setLogger(logger);
		}
	}

	flushProperties() {
		this._lastCommandId = 0;
		this._ws = null;
		this._mostRecentMessageReceivedDate = null;

		this._initializationPromise = null;
		this._initializationPromiseResolver = null;

		this._commandsAwaitors = {};
		this._terminating = false;
	}

	flushData() {
		this._tickers = {};
		this._orders = {};
	}

	log(...fArgs) {
		fArgs.unshift(this._url);

		if (this._logger) {
			this._logger.info.apply(this._logger, fArgs);
		} else {
			console.log.apply(this._logger, fArgs);
		}
	}

	async close() {
		this.log('Terminating...');

		clearTimeout(this._pingTimeout);
		this._terminating = true;

		if (this._ws) {
			this._ws.terminate();
		}
	}

	async processNotification(json) {
		let notificationDescription = (json && json.method) ? json.method : '';
		// this.log('Got notification', notificationDescription);

		this.emit('notification', json);
	}

	async reconnect() {
		if (this._ws) {
			this._terminating = true;
			this._ws.terminate();
		}
		this.log('Reconnecting to websocket...');

        await new Promise((res)=>{ setTimeout(res, 1000); });
		this.flushProperties();

		this._terminating = false;
		const success = await this.initialize();
	}

	async initialize() {
		if (this._initializationPromise) {
			return await this._initializationPromise;
		}

		this.log('Initializing WebSocket connection...');
		this.flushProperties();
		this.heartBeat(); // try to reconnect if no luck here

		this._initializationPromise = new Promise((res)=>{
			this._initializationPromiseResolver = res;
		});

		this._ws = new WebSocket(this._url, {
			perMessageDeflate: false,
		});

		let success = false;

		this._ws.on('message', (data)=>{
			this._mostRecentMessageReceivedDate = new Date();
			this.heartBeat();

			let json = {};
			try {
				json = JSON.parse(data);
			} catch(e) {

			}
			if (json.id && this._commandsAwaitors[json.id]) {
				if (json.error) {
					this.log('Got error', json.error);
				}
				this._commandsAwaitors[json.id].promiseResolver(json.result);
			} else {
				this.processNotification(json);
			}
		});

		this._ws.on('close', ()=>{
			this.log('Got close event', this._terminating);

			this.emit('close');

			if (!this._terminating) {
				this.reconnect();
			}
		});

		this._ws.on('ping', ()=>{
				this._mostRecentMessageReceivedDate = new Date();
				this.heartBeat();
				// this.log('got ping');
			});

		// await for initializtion
		await new Promise((res)=>{
			this._ws.on('open', ()=>{
					success = true;
					this.log('WebSocket connection opened');
					res();

					this.emit('open');
				});
			this._ws.on('error', ()=>{
					this.log('WebSocket connection error');

					success = false;
					res();
				});
		});


		this._initializationPromiseResolver(success);

		return success;
	}

	heartBeat() {
		clearTimeout(this._pingTimeout);
		// Use `WebSocket#terminate()`, which immediately destroys the connection,
		// instead of `WebSocket#close()`, which waits for the close timer.
		// Delay should be equal to the interval at which your server
		// sends out pings plus a conservative assumption of the latency.
		this._pingTimeout = setTimeout(() => {
			this.reconnect();
		}, 30000 + 1000);

	}

	async sendRequest(data) {
		await this.initialize();

		this._lastCommandId++;
		const commandId = this._lastCommandId;
		const id = 'command_'+this._lastCommandId;

		data.id = id;

		let promiseResolver = null;
		let promise = new Promise((res)=>{ promiseResolver = res; });
		this._commandsAwaitors[id] = {
			promise: promise,
			promiseResolver: promiseResolver,
		};

		let requestDescription = (data && data.method) ? data.method : '';
		this.log('Sending request...', requestDescription);

		const sentAt = (new Date()).getTime();

		let timeout = null;
		await Promise.race([
					this._ws.send(JSON.stringify(data)),
					new Promise((res)=>{ timeout = setTimeout(res, this._timeout); })
				]);
		clearTimeout(timeout);

		timeout = null;
		const results = await Promise.race([
					promise,
					new Promise((res)=>{ timeout = setTimeout(res, this._timeout); })
				]);
		clearTimeout(timeout);

		delete this._commandsAwaitors[id]; // free some memory

		const tookTime = ((new Date()).getTime()) - sentAt;

		this.log('Got response for: ', requestDescription, 'Took '+tookTime+'ms');

		if (requestDescription.indexOf('new_order') != -1) {
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log('!');
			console.log(results);
			// this.log(results);
		}

		return results;
	}
};

module.exports = ConstantSocket;