const ConstantSocket = require('./ConstantSocket.js');

class HitBtcSocket extends ConstantSocket {
	constructor(params = {}) {
		super(params);

		this.on('open', ()=>{
			this.socketOpened();
		});
		this.on('close', ()=>{
			this.socketClosed();
		});
		this.on('notification', (json)=>{
			this.notification(json);
		});

		this._subscriptions = [];
	}

	notification(json) {
		// console.log(json);
		this.emit('data', json.data);
		this.emit('json', json);

		for (let subscription of this._subscriptions) {
			if (subscription.ch == json.ch) {
				if (subscription.callback instanceof Function) {
					subscription.callback(json.data);
				}
			}
		}
	}

	socketOpened() {

		this.emit('opened'); // another event to be fired before re-subscribing to events

		for (let subscription of this._subscriptions) {
			if (!subscription.active) {
				this.subscribeToOnSocket(subscription);
			}
		}
	}

	socketClosed() {
		this.emit('closed');

		for (let subscription of this._subscriptions) {
			subscription.active = false;
		}
	}

	async subscribeToOnSocket(subscription) {
		this.log('subscribeTo ', subscription.ch);

		const resp = await this.sendRequest({
			method: 'subscribe',
			ch: subscription.ch,
			params: subscription.params,
		});

		if (resp && resp.ch == subscription.ch) {
			subscription.active = true;

			return true;
		}

		return false;
	}

	async subscribeTo(ch, params, callback) {
		const subscription = {
			ch: ch,
			params: params,
			active: false,
			callback: callback,
		};

		this._subscriptions.push(subscription);
		return await this.subscribeToOnSocket(subscription);
	}
};

module.exports = HitBtcSocket;