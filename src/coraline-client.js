/** Coraline front-end module, for programming endpoints
*	@requires EventEmitter
*/
let EventEmitter = require('EventEmitter');

// CoralineInstance
	// Base
		/**
		*	Represents a Coraline server, it does have functions for sending and receiving messages and queries from clients
		*	
		*	@extends EventEmitter
		*/
		class CoralineInstance extends EventEmitter {

			/**
			*	@constructor
			*	@param {Socket} sock - SocketIO master connection
			*	@param {Object} config - Coraline Configuration Object
			*	@param {number} config.max_clients - Max number of clients allowed
			*	@param {String} config.name - The name of the Coraline
			*	@param {number} config.id - Internal Coraline reference ID
			*/
			constructor (sock, config) {
				super();
				/**
				*	SocketIO master connection
				*	
				*	@member {Socket}
				*/
				this.sock = sock;

				/** 
				*	Client pool 
				*	
				*	@member {Object}
				*/
				this.clients = {};

				/**
				*	Query EventEmitter 
				*	
				*	@member {EventEmitter}
				*/
				this.qmanager = new EventEmitter();

				/**
				*	Coraline ID
				*	@readonly
				*	@member {number}
				*/
				this.id = config.id;

				/**
				*	Coraline name
				*	@readonly
				*	@member {String}
				*/
				this.name = config.name;

				/**
				*	Coraline max_clients
				*	@readonly
				*	@member {number}
				*/
				this.max_clients = config.max_clients;

				sock.on('client-on', (id) => this.clients[id] = new Client(this.sock, id));
				sock.on('client-off', (id) => delete this.clients[id]);

				sock.on('message', (src, signal, ...args) => {
					this.emit('message', src, signal, ...args);
					this.clients[src] && this.clients[src].emit(signal, ...args);
				});

				sock.on('query', (src, iid, signal, ...args) => {
					this.emit('query', src, iid, signal, ...args);
					this.qmanager.emit(signal, src, iid, ...args);
					this.clients[src] && this.clients[src].qmanager.emit(signal, iid, ...args);
				});

				sock.on('resolve', (id, iid, ...args) => {
					this.clients[id] && this.clients[id].resolveQuery(iid, ...args);
				});
			}

			/** 
			*	Returns a client with specified id
			*
			*	@param {number} client_id - Client ID to search
			*/
			client (client_id) {
				return this.clients[client_id];
			}

			/** 
			*	Resolves a query
			*
			*	@param {number} id  	 - Client ID
			*	@param {number} iid 	 - Query ID
			*	@param {...Any} ...args  - Arguments to send
			*/
			resolve (id, iid, ...args) {
				return this.client(id).resolve(iid, ...args);
			}

			/**
			*	Adds a listener to a query event
			*
			*	@param {String}   		  signal - Event name to listen
			*	@param {Function(...Any)} cb 	 - Callback fired each time a query with the specified signal is received
			*/
			onquery (signal, cb) {
				this.qmanager.on(signal, (src, iid, ...args) => {
					let res = cb(...args);

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

			/**
			*	Emits a broadcast signal to clients
			*
			*	@param {String} signal  - Signal to emit
			*	@param {...Any} ...args - Arguments to send
			*/
			broadcast (signal, ...args) {
				this.sock.emit('broadcast', signal, ...args);
			}
		}
	// Client
		/**
		*	Represents a client connected to a Coraline instance, it does have options for managing queries and messages
		*
		*	It <b>must not</b> be confused with <b>CoralineClient</b>, this class does not act as client, is only a wrapper for sending and receiving info from connected clients
		*
		*	@extends EventEmitter
		*/
		class Client extends EventEmitter {

			/**
			*	@constructor
			*	@param {Socket} sock - Socket of the parent coraline's master
			*	@param {number} id 	 - Client ID
			*/
			constructor (sock, id) {
				super();

				/**
				*	Client ID
				*	
				*	@member {number}
				*/
				this.id = id;

				/**
				*	Query manager object
				*	
				*	@member {Object}
				*/
				this.queries = {};

				/**
				*	Query EventEmitter
				*	
				*	@member {EventEmitter}
				*/
				this.qmanager = new EventEmitter();

				/**
				*	ID Counter for queries
				*	
				*	@member {number}
				*/
				this.iid = 0;
				
				/**
				*	SocketIO master connection
				*	
				*	@member {Socket}
				*/
				this.sock = sock;
			}

			/**
			*	Adds a query to the query pool
			*
			*	@param {Function} fn - Query callback
			*/
			addQuery (fn) {
				this.queries[this.iid++] = fn;
			}

			/**
			*	Runs a query and deletes it from the query pool
			*
			*	@param {number} iid    	- Query ID
			*	@param {...Any} ...args - Arguments to pass to the function
			*/
			resolveQuery (iid, ...args) {
				let fn = this.queries[iid];
				if(!fn) return;

				delete this.queries[iid];
				fn(...args);
			}

			/**
			*	Emits a resolve signal to the client
			*
			*	@param {number} iid 	- Query ID
			*	@param {...Any} ...args - Arguments to emit
			*/
			resolve (iid, ...args) {
				return new Promise((done, err) => {
					this.sock.emit('resolve-to', this.id, iid, ...args);
					this.sock.on('resolve-to-failed', err);
					this.sock.on('resolve-to-success', done);
				});
			}

			/**
			*	Emits a message to the remote client
			*
			*	@param {String} signal 	- Signal to emit
			*	@param {...Any} ...args - Data to send
			*/
			message (signal, ...args) {
				let sock = this.sock;
				return new Promise((done, err) => {
					sock.emit('message-to', this.id, signal, ...args);
					sock.once('message-to-failed', err);
					sock.once('message-to-success', done);
				});
			}

			/**
			*	Emits a query to the remote client
			*
			*	@param {String} signal 	- Signal to emit
			*	@param {...Any} ...args - Data to send
			*/
			query (signal, ...args) {
				return new Promise((done, err) => {
					let sock = this.sock;
					sock.emit('query-to', this.id, this.iid, signal, ...args);
					sock.once('query-to-failed', err);
					this.addQuery(done);
				});	
			}

			/**
			*	Adds a listener to a query event
			*
			*	@param {String}   		  signal - Event name to listen
			*	@param {Function(...Any)} cb 	 - Callback fired each time a query with the specified signal is received
			*/
			onquery (signal, cb) {
				this.qmanager.on(signal, (iid, ...args) => {
					let res = cb(...args);

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
	/**
	* Represents a Coraline Client, it does have function for login to Coralines and handle messages and queries
	* @extends EventEmitter
	*/

	class CoralineClient extends EventEmitter {

		/**
		*	@constructor
		*
		*	@param {Socket} sock - Client socket connection
		*	@param {number} id 	 - Client ID given by the Coraline server
		*	@param {Object} coraline - Coraline.toObject object
		*	@param {number} coraline.id   - Coraline ID
		*	@param {String} coraline.name - Coraline name
		*	@param {number} coraline.max_clients - Maximum number of clients connected
		*/
		constructor (sock, id, coraline) {
			super();

			/**
			*	SocketIO connection
			*	
			*	@member {Socket}
			*/
			this.sock = sock;

			/**
			*	Client ID
			*	
			*	@member {Socket}
			*	@readonly
			*/
			this.id = id;

			/**
			*	Remote Coraline Info
			*	
			*	@member {Object}
			*	@readonly
			*/
			this.coraline = coraline;

			/**
			*	Query container object
			*	
			*	@member {Object}
			*/
			this.queries = {};

			/**
			*	Query event manager
			*	
			*	@member {EventEmitter}
			*/
			this.qmanager = new EventEmitter();

			/**
			*	Query ID Counter
			*	
			*	@member {number}
			*/
			this.iid = 0;

			sock.on('message', (signal, ...args) => {
				this.emit(signal, ...args);
			});

			sock.on('query', (iid, signal, ...args) => {
				this.qmanager.emit(signal, iid, ...args);
			});

			sock.on('resolve', (iid, ...args) => {
				this.resolveQuery(iid, ...args);
			});
		}


		/**
		*	Emits a message to the server
		*
		*	@param {String} signal - Signal to emit
		*	@param {...Any} args   - Arguments to send
		*/
		message (signal, ...args) {
			let sock = this.sock;
			return new Promise((done, err) => {
				sock.emit('message', signal, ...args);
				sock.once('message-failed', err);
				sock.once('message-success', done);
			});
		}


		/**
		*	Runs a query and deletes it from the query pool
		*
		*	@param {number} iid    	- Query ID
		*	@param {...Any} ...args - Arguments to pass to the function
		*/
		resolveQuery (iid, ...args) {
			let fn = this.queries[iid];
			if(!fn) return;

			delete this.queries[iid];
			fn(...args);
		}


		/**
		*	Makes a query to the server
		*
		*	@param {String} signal - Signal to emit
		*	@param {...Any} ...args - Arguments to send
		*/
		query (signal, ...args) {
			let sock = this.sock;
			return new Promise((done, err) => {
				let iid = this.iid++;
				sock.emit('query', iid, signal, ...args);
				sock.once('query-failed', err);
				this.queries[iid] = done;
			});	
		}

		/**
		*	Emits a resolve signal to the server
		*
		*	@param {number} iid     - Query ID
		*	@param {...Any} ...args - Arguments to response
		*/
		resolve (iid, ...args) {
			return new Promise((done, err) => {
				this.sock.emit('resolve', iid, ...args);
				this.sock.on('resolve-failed', err);
				this.sock.on('resolve-success', done);
			});
		}

		/**
		*	Adds a listener to a query event
		*
		*	@param {String}   		  signal - Event name to listen
		*	@param {Function(...Any)} cb 	 - Callback fired each time a query with the specified signal is received
		*/
		onquery (signal, cb) {
			this.qmanager.on(signal, (iid, ...args) => {
				let res = cb(...args);

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

	/**
	*	Main Coraline class, it exposes the apis to create CoralineInstances and CoralineClients
	*/
	class Coraline {

		/**
		*	@constructor
		*	
		*	@param {Socket} sock - Socket.io socket that will be used to emit and receive signals
		*/
		constructor (sock) {
			/**
			*	Main socket
			*	@member {Socket}
			*/
			this.sock = sock;
		}

		/**
		*	Creates a <b>CoralineInstance</b>
		*
		*	@param {Object} config - Coraline Configuration Object
		*	@param {number} config.max_clients - Max number of clients allowed
		*	@param {String} config.password    - Security password
		*/
		create (config =  {}) {
			config.password = config.password || "";
			return new Promise ((done, err) => {
				let sock = this.sock;

				sock.emit('create', config);
				sock.once('create-failed', err);
				sock.once('create-success', (coraline) => {
					done(new CoralineInstance(sock, coraline))
				});
			});
		}

		/**
		*	Connects to a remote Coraline Instance
		*
		*	@param {number} coraline_id - Remote Coraline ID
		*	@param {String} password - Coraline's security password
		*/
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