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
var session = require('express-session');

app.get('/', function(req, res) {
	var error = undefined;
	res.render('index');
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({secret: 'secret-token-here', resave: false, saveUninitialized: false}));

// Attempting to login
app.post('/loginAuth', function(req, res) {
	var username = req.body.username;
	var password = md5(req.body.password);
	var query = "SELECT * FROM Person WHERE username = ? AND password = ?";
	connection.query(query, [username, password], function(err, rows, fields) {
		// No user exists, render error message
		if (rows.length === 0) {
			error = "The username or password you entered is incorrect."
			res.render('index', {error: error});
		} else {
			var session = req.session;
			session.username = username;
			res.redirect('/home');
		}
	});
	return;
});

// Registering new user 
app.post('/register', function(req, res) {
	var username = req.body.username;
	var password = req.body.password;
	res.render('register', {username: username, password: password}); 
	return;
})

// Attempting to register new user
app.post('/registerAuth', function(req, res) {
	var firstName = req.body.first_name;
	var lastName = req.body.last_name;
	var username = req.body.username;
	var password = req.body.password;
	var hashedPassword = md5(password);

	var query = "SELECT * FROM Person WHERE username = ?";
	connection.query(query, username, function(err, rows, fields) {
		// Username already exists
		if (rows.length > 0) {
			error = "This username is already registered."
			res.render('register', {username: username, password: password, error: error});
		} else {
			// Username does not exist, insert into database
			var query = "INSERT INTO Person (username, password, first_name, last_name) Values (?, ?, ?, ?)";
			connection.query(query, [username, hashedPassword, firstName, lastName], function(err, rows, fields) {
				if (err) throw err;
			});
			res.redirect('/home');
		}
	})
	return;
})

app.get('/home', function(req, res) {
	var username = req.session.username;
	var query = "SELECT Content.id, Content.content_name " +
				"FROM Content, Share " +
				"WHERE Content.id = Share.id AND " +
				"(Content.public = TRUE OR (Share.group_name, Share.username) IN " +
				"(SELECT group_name, username FROM FriendGroup NATURAL JOIN Member WHERE Member.username = ?))"
	connection.query(query, username, function(err, rows, fields) {
		if (err) throw err;
		console.log(rows);
	})
	res.render('home');
})

app.listen(3000, () => console.log("Server running at http://localhost:3000/"));
