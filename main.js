// Connecting to MySql
var mysql = require('mysql');

var connection = mysql.createConnection({
	host: "localhost",
	port: "8889",
	user: "root",
	password: "root",
	database: "PriCoSha"
});

connection.connect(function(err) {
	if (err) throw err;
	console.log("connected");
});

// Creating web server
var http = require("http");
var express = require("express");
var app = express();

app.get('/', function(req, res) {
	res.sendFile('templates/index.html', {root: __dirname });
});

app.use(express.bodyParser());
app.post('/login', function(req, res) {
	console.log('Username: ' + req.body.username);
	console.log('Password: ' + req.body.password);
})

app.listen(3000, () => console.log("Server running at http://localhost:3000/"));
