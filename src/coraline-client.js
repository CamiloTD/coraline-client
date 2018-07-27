let EventEmitter = require('EventEmitter');
// CoralineInstance
	// Base
		class CoralineInstance extends EventEmitter {

			constructor (sock, config) {
				super();
				this.sock = sock;
				this.clients = {};
				this.qmanager = new EventEmitter();

				for(let i in config) this[i] = config[i];

				sock.on('client-on', (id) => this.clients[id] = new Client(this.sock, id));
				sock.on('client-off', (id) => delete this.clients[id]);

				sock.on('message', (src, signal, ...data) => {
					this.emit('message', src, signal, ...data);
					this.clients[src] && this.clients[src].emit(signal, ...data);
				});

				sock.on('query', (src, iid, signal, ...data) => {
					this.emit('query', src, iid, signal, ...data);
					this.qmanager.emit(signal, src, iid, ...data);
					this.clients[src] && this.clients[src].qmanager.emit(signal, iid, ...data);
				});

				sock.on('resolve', (id, iid, ...res) => {
					this.clients[id] && this.clients[id].resolveQuery(iid, ...res);
				});
			}

			client (client_id) {
				return this.clients[client_id];
			}

			resolve (id, iid, ...res) {
				return this.client(id).resolve(iid, ...res);
			}

			onquery (signal, cb) {
				this.qmanager.on(signal, (src, iid, ...data) => {
					let res = cb(...data);

					if(cb instanceof Promise) cb.then((res) => {
							this.resolve(src, iid, res);
						}).catch((exc) => {
							this.resolve(src, iid, exc);
						});
					else
						this.resolve(src, iid, res);

				});
				return this;
			}

			broadcast (signal, ...data) {
				this.sock.emit('broadcast', signal, ...data);
			}
		}
	// Client
		class Client extends EventEmitter {

			constructor (sock, id) {
				super();
				this.id = id;
				this.queries = {};
				this.qmanager = new EventEmitter();
				this.iid = 0;
				this.sock = sock;
			}

			addQuery (fn) {
				this.queries[this.iid++] = fn;
			}

			resolveQuery (iid, ...res) {
				let fn = this.queries[iid];
				if(!fn) return;

				delete this.queries[iid];
				fn(...res);
			}

			resolve (iid, ...res) {
				return new Promise((done, err) => {
					this.sock.emit('resolve-to', this.id, iid, ...res);
					this.sock.on('resolve-to-failed', err);
					this.sock.on('resolve-to-success', done);
				});
			}

			message (cmd, ...data) {
				let sock = this.sock;
				return new Promise((done, err) => {
					sock.emit('message-to', this.id, cmd, ...data);
					sock.once('message-to-failed', err);
					sock.once('message-to-success', done);
				});
			}

			query (cmd, ...data) {
				return new Promise((done, err) => {
					let sock = this.sock;
					sock.emit('query-to', this.id, this.iid, cmd, ...data);
					sock.once('query-to-failed', err);
					this.addQuery(done);
				});	
			}

			onquery (signal, cb) {
				this.qmanager.on(signal, (iid, ...data) => {
					let res = cb(...data);

					if(cb instanceof Promise) cb.then((res) => {
							this.resolve(iid, res);
						}).catch((exc) => {
							this.resolve(iid, exc);
						});
					else
						this.resolve(iid, res);

				});
				return this;
			}

		}
// CoralineClient
	class CoralineClient extends EventEmitter {

		constructor (sock, id, coraline) {
			super();
			this.sock = sock;
			this.id = id;
			this.coraline = coraline;
			this.queries = {};
			this.qmanager = new EventEmitter();
			this.iid = 0;

			sock.on('message', (signal, ...data) => {
				this.emit(signal, ...data);
			});

			sock.on('query', (iid, signal, ...data) => {
				this.qmanager.emit(signal, iid, ...data);
			});

			sock.on('resolve', (iid, ...res) => {
				this.resolveQuery(iid, ...res);
			});
		}

		message (cmd, ...data) {
			let sock = this.sock;
			return new Promise((done, err) => {
				sock.emit('message', cmd, ...data);
				sock.once('message-failed', err);
				sock.once('message-success', done);
			});
		}

		resolveQuery (iid, ...res) {
			let fn = this.queries[iid];
			if(!fn) return;

			delete this.queries[iid];
			fn(...res);
		}

		query (cmd, ...data) {
			let sock = this.sock;
			return new Promise((done, err) => {
				let iid = this.iid++;
				sock.emit('query', iid, cmd, ...data);
				sock.once('query-failed', err);
				this.queries[iid] = done;
			});	
		}

		resolve (iid, ...res) {
			return new Promise((done, err) => {
				this.sock.emit('resolve', iid, ...res);
				this.sock.on('resolve-failed', err);
				this.sock.on('resolve-success', done);
			});
		}

		onquery (signal, cb) {
			this.qmanager.on(signal, (iid, ...data) => {
				let res = cb(...data);

				if(cb instanceof Promise) cb.then((res) => {
						this.resolve(iid, res);
					}).catch((exc) => {
						this.resolve(iid, exc);
					});
				else
					this.resolve(iid, res);
			});
			return this;
		}
	}
// Coraline
	class Coraline {

		constructor (sock) {
			this.sock = sock;
		}

		create (pass, config) {
			config.password = config.password || "";
			return new Promise ((done, err) => {
				let sock = this.sock;

				sock.emit('create', pass, config);
				sock.once('create-failed', err);
				sock.once('create-success', (coraline) => {
					done(new CoralineInstance(sock, coraline))
				});
			});
		}

		login (coraline_id, pass = "") {
			return new Promise((done, err) => {
				let sock = this.sock;

				sock.emit('login', coraline_id, pass);
				sock.once('login-failed', err);
				sock.once('login-success', (id, coraline) => {
					done(new CoralineClient(sock, id, coraline))
				});
			});
		}
	}

module.exports = Coraline;