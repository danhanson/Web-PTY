'use strict';
const conf = require(__dirname + '/config.json');
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const https = require('https').createServer({
	key: fs.readFileSync(path.resolve(__dirname, conf.ssl.key)),
	cert: fs.readFileSync(path.resolve(__dirname, conf.ssl.cert))
}, app);
const io = require('socket.io')(https);
const pty = require('pty.js');
const ip = require('ip');

function login(socket){
	if(!socket.connected){
		return;
	}
	const term = pty.spawn(conf.command.name, conf.command.args, {
		cols:80,
		rows:60,
		cwd:process.env.HOME,
		env:process.env
	});
	term.stdout.on('data', (data) => socket.emit('stdout', data));
	socket.on('stdin', (data) => term.stdin.write(data));
	socket.on('disconnect',() => { term.stdin.write('\n\rdisconnected\n\r'); term.kill() });
	socket.on('resize',(data) => {
		term.resize(data.cols, data.rows);
	});
	term.on('exit',() => login(socket)); // do not let the user leave! They should disconnect their socket first!
}

app.use(function(req, res, next){
	if(conf.whitelist && !conf.whitelist.some(w => ip.isEqual(req.ip, w))){
		res.status(403);
		res.send();
		return;
	}
	if(req.secure){
		next();
		return;
	}
	var redirectUrl = 'https://' + req.headers.host.split(':')[0];
	if(conf.ports.https !== 443){
		 redirectUrl += ':' + conf.ports.https;
	}
	res.redirect(redirectUrl);
});

io.on('connection', (socket) => {
	login(socket);
});

app.use('/scripts/socket.io.js', express.static(__dirname + '/node_modules/socket.io-client/socket.io.js'));
app.use('/scripts/xterm.js', express.static(__dirname + '/node_modules/xterm/src/xterm.js'));
app.use('/stylesheets/xterm.css', express.static(__dirname + '/node_modules/xterm/src/xterm.css'));
app.use('/scripts/fit.js', express.static(__dirname + '/node_modules/xterm/addons/fit/fit.js'));
app.use('/', express.static(__dirname + '/public'));

http.listen(conf.ports.http);
https.listen(conf.ports.https);

console.log('listening to ports ' + conf.ports.http + ' for http and ' + conf.ports.https + ' for https');

