require('semantic-ui/label.css');

let Coraline = require('/coraline-client');
let io = require('socket.io.js');
let $ = require('jquery');

let sock = io();
let foo = io();

(async () => {
	let coraline, client;
	// [Coraline].create(config)
		try {
			coraline = await (new Coraline(sock)).create('C0ral1n3', {
				name: "Testing Coraline"
			});

			success('[Coraline].create(pass, config)')
		} catch (exc) {
			failure('[Coraline].create(pass, config)', exc);
		}
	// [Coraline].login(coraline_id[, pass])
		try {
			client = await (new Coraline(sock)).login(coraline.id);
			success('[Coraline].login(pass, config)');
		} catch (exc) {
			failure('[Coraline].login(pass, config)', exc);
		}
	// [CoralineInstance].message(target, signal, ...data)
		client.once('ping', () => success('[CoralineInstance].message(target, signal, ...data)'));
		
		try {
			await coraline.client(client.id).message('ping');
		} catch (exc) {
			failure('[CoralineInstance].message(target, signal, ...data)', exc);
		}
	// [CoralineClient].message(signal, ...data)
		coraline.client(client.id).once('ping', () => success('[CoralineClient].message(target, signal, ...data)'));
		
		try {
			await client.message('ping');
		} catch (exc) {
			failure('[CoralineClient].message(target, signal, ...data)', exc);
		}
	// [CoralineClient].message(signal, ...data) - onmessage API
		coraline.mmanager.once('ping', () => success('[CoralineClient].message(target, signal, ...data) - mmanager'));
		
		try {
			await client.message('ping');
		} catch (exc) {
			failure('[CoralineClient].message(target, signal, ...data) - mmanager', exc);
		}
	// [CoralineInstance].query(target, signal, ...data)
		client.onquery('ping', () => 'pong');

		try {
			let res = await coraline.client(client.id).query('ping');
			if(res !== 'pong') throw "INVALID_RESPONSE: " + res;

			success('[CoralineInstance].query(target, signal, ...data)');
		} catch (exc) {
			failure('[CoralineInstance].query(target, signal, ...data)', exc);
		}
	// [CoralineClient].query(target, signal, ...data)
		coraline.client(client.id).onquery('ping', () => 'pong');

		try {
			let res = await client.query('ping');

			if(res !== 'pong') throw "INVALID_RESPONSE: " + res;
			success('[CoralineClient].query(target, signal, ...data)');
		} catch (exc) {
			failure('[CoralineClient].query(target, signal, ...data)', exc);
		}
	// [CoralineInstance].broadcast(signal, ...data)
		client.once('msg', () => success('[CoralineInstance].broadcast(signal, ...data)'));

		try {
			await coraline.broadcast('msg');
		} catch (exc) {
			failure('[CoralineInstance].broadcast(signal, ...data)', exc);
		}
})();

function setLabel (tag, color) {
	$('body').append('<a class="ui ' + color + ' label">' + tag + '</a><br><br>')
}

function success (tag) {
	setLabel(tag, 'green');
}

function failure (tag, err) {
	console.log(tag + ":", err);
	setLabel(tag + ": " + err, 'red');
}