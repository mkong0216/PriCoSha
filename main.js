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
app.set('view engine', 'ejs');  
var bodyParser = require('body-parser');
var md5 = require('md5');

app.get('/', function(req, res) {
	var error = undefined;
	res.render('index');
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Attempting to login
app.post('/login', function(req, res) {
	var username = req.body.username;
	var password = md5(req.body.password);
	var query = "SELECT * FROM Person WHERE username = ? AND password = ?";
	connection.query(query, [username, password], function(err, rows, fields) {
		if (rows.length === 0) {
			error = "The username or password you entered is incorrect."
			res.render('index', {error: error});
		} else {
			res.send('User exists!');
		}
	});
});

app.listen(3000, () => console.log("Server running at http://localhost:3000/"));
