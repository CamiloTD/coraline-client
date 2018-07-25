const http = require('http');
const express = require('express');
const socket_io = require('socket.io');
const Coraline = require('coraline');
const opn = require('opn');

let app = express();
let server = http.Server(app);
let io = socket_io(app);

app.use(express.static('public'));
server.listen(8080, () => {
	console.log("Server is listening at port :8080");
	opn('http://localhost:8080');
});