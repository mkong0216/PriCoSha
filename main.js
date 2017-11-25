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
	console.log("Connected to database");
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
	res.render('index', {error: false});
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
			var err = "The username or password you entered is incorrect."
			res.render('index', {error: true, err: err});
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
	res.render('register', {username: username, password: password, error: false}); 
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
			var err = "This username is already registered."
			res.render('register', {username: username, password: password, error: true, err: err});
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
	var success = req.session.success;
	var friendGroups = "SELECT group_name, username_creator FROM Member WHERE username = ?"
	connection.query(friendGroups, username, function(err, rows, fields) {
		if (err) throw err;
	})
	req.session.success = null; 
	res.render('home', {username: username, error: false, success: success});
})

app.post('/create-group', function(req, res) {
	var creator = req.session.username;
	var groupName = req.body.group_name;
	var description = req.body.description;
	var members = req.body.members.split(',');
	members.push(creator);
	var errArray = []

	var promises = members.map((member) => checkUserExists(member));
	promises.push(checkGroupNotExists(creator, groupName));

	return Promise.all(promises)
		.then((errStrings, error) => {
			if (checkAnyErrors(errStrings) === 0) {
				createFriendGroup(creator, groupName, description);
				members.map((member) => addMemberToGroup(member, groupName, creator)); 
				req.session.success = "You have successfully created the FriendGroup " + groupName;
				res.redirect('/home');
			} else {
				res.render('home', {username: creator, error: true, err: errStrings});
			}
		});
})

function checkGroupNotExists(username, groupName) {
	var query = "SELECT * FROM FriendGroup WHERE username = ? AND group_name = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, [username, groupName], (err, rows) => {
			if (err) return reject(err);
			if (rows.length !== 0) {
				var errString = "You already have a FriendGroup named " + groupName; 
				resolve(errString);
			} else {
				resolve(null);
			}
		})
	})
}

function checkAnyErrors(errArray) {
	count = 0;
	for (var i = 0; i < errArray.length; i++) {
		if (errArray[i] !== null) count += 1; 
	}
	return count; 
}

function checkUserExists(member) {
	var query = "SELECT * FROM Person WHERE username = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, member, (err, rows) => {
			if (err) return reject(err);
			var errString = ''
			if (rows.length === 0) {
				var errString = "The user " + member + " does not exist";
				resolve(errString);
			} else {
				resolve(null);
			}
		});
	})
}

function createFriendGroup(creator, groupName, description) {
	var query = "INSERT INTO FriendGroup(group_name, username, description) VALUES (?, ?, ?)";
	connection.query(query, [groupName, creator, description], function(err, rows, fields) {
		if (err) throw err;
	});
	return;
}

function addMemberToGroup(member, group, creator) {
	var query = "INSERT INTO Member(username, group_name, username_creator) VALUES (?, ?, ?)";
	connection.query(query, [member, group, creator], function (err, rows, fields) {
		if (err) throw err;
	});
	return; 
}

app.get('/logout', function(req, res) {
	req.session.destroy();
	res.redirect('/');
})

app.listen(3000, () => console.log("Server running at http://localhost:3000/"));
