const WebSocket = require('ws');
const fetch = require('centra-aero');

const { EventEmitter } = require('events');
const { promisify } = require('util');

const sleep = promisify(setTimeout);
const noop = () => { };

class ChatWatchClient extends EventEmitter {

	constructor(token) {
		super();
		this.token = token;
		this.ws = null;
		this.url = null;
	}

	async login(token) {
		if (token) this.token = token;
		if (!this.url) {
			await this.acquireSession();
		}

		this.ws = new WebSocket(this.url, { headers: { authorization: this.token } });

		this.ws.on('close', (code, reason) => {
			this.ws = null;
			this.url = null;
			this.emit('close', code, reason);
			setTimeout(() => this.login(this.token), 5000);
		});

		this.ws.on('message', (rawData) => {
			const data = JSON.parse(rawData);
			if (data.event === 'message_response') this.emit('response', data.data);
		});

		return new Promise((resolve) => {
			this.ws.on('message', (rawData) => {
				const data = JSON.parse(rawData);
				if (data.event === 'connection' && data.data === 'ok') {
					this.emit('connected');
					resolve(true);
				}
			});
		})
	}

	async acquireSession() {
		if (!this.token) throw new Error('No ChatWatch token provided.');
		let retryCount = 0;
		while (!this.url && retryCount < 3) {
			try {
				const res = await fetch('https://gateway.chatwatch.ksoft.si/acquire')
					.header('authorization', this.token)
					.send();
				if (res.statusCode !== 200) {
					retryCount++;
					throw new Error(`Failed acquiring a session\n${res.statusCode}: ${res.body}`);
				}
				this.url = res.json.url;
			} catch (e) {
				console.error(e);
				await sleep(5000);
			}
		}
	}

	ingest(content, { user, message, channel, guild }) {
		return this.ws.send(JSON.stringify(
			{
				event: 'message_ingest',
				data: {
					guild,
					channel,
					user,
					message_id: message,
					message: content
				}
			}
		));
	}

}

module.exports = ChatWatchClient;