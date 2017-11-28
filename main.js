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
				res.redirect('/home');
			});
		}
	})
	return;
})

// Home page of user
// Gets FriendGroups that user is a member of and contents that are visible to user
app.get('/home', function(req, res) {
	var username = req.session.username;
	var success = req.session.success;
	req.session.success = null; 
	var contents = req.session.contents;
	var groups = req.session['FriendGroups'];
	Promise.all([getContents(username), getFriendGroups(username)])
		.then((results) => {
			req.session.contents = results[0];
			req.session['FriendGroups'] = results[1];
			res.render('home', {
				username: username,
				error: false,
				success: success,
				groups: req.session['FriendGroups'],
				contents: req.session.contents 
			})
		})
})

// Gets contents shared to FriendGroups user is a member of 
// Or contents that are public to everyone 
function getContents(username) {
	var query = "SELECT * FROM Content NATURAL LEFT JOIN Share WHERE Content.public IS true " +
				"OR (group_name, username) IN " +
				"(SELECT group_name, username_creator FROM Member WHERE username = ?)" +
				"ORDER BY timest DESC"
	return new Promise((resolve, reject) => {
		connection.query(query, username, function(err, rows, fields) {
			if (err) return reject(err);
			resolve(rows);
		})
	})
}

// User is adding content and sharing to FriendGroup(s) or making it public
app.post('/share-content', function(req, res) {
	var username = req.session.username;
	var file_path = req.body.file_path;
	var content_name = req.body.content_name;
	var isTagged = req.body.tag;
	var tagged = (Array.isArray(req.body.tagged)) ? req.body.tagged : new Array(req.body.tagged);
	var friendGroups = (Array.isArray(req.body.group_name)) ? req.body.group_name : new Array(req.body.group_name);
	var isPrivate = req.body.isPrivate;

	createContent(username, file_path, content_name, isPrivate)
		.then((id) => {
			if (isPrivate === 'on') {
				var promises = friendGroups.map((group) => shareContent(id, group, username));
				return Promise.all(promises);
			} else {
				return null; 
			}
		})
		.then(() => {
			req.session['success'] = "You have successfully shared your content";
			res.redirect('/home');
		})
})

// Insert content into Content database
function createContent(username, file_path, content_name, isPrivate) {
	var isPublic = !(isPrivate === 'on');
	var query = "INSERT INTO Content(id, username, file_path, content_name, public) VALUES (?, ?, ?, ?, ?)";
	return new Promise ((resolve, reject) => {
		connection.query(query, [null, username, file_path, content_name, isPublic], (err, rows) => {
			if (err) return reject(err);
			resolve(rows.insertId);
		});
	})
}

// Insert content into Share database
function shareContent(id, groupName, username) {
	var query = "INSERT INTO Share(id, group_name, username) VALUES (?, ?, ?)";
	return new Promise ((resolve, reject) => {
		connection.query(query, [id, groupName, username], (err, rows) => {
			if (err) return reject(err);
			resolve(rows);
		})
	})
}

// User is creating a new FriendGroup and adding at least one member to FriendGroup
// If FriendGroup already exists, display warning message
// If member that user is trying to add to FriendGroup does not exist, display warning message
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
			if (checkAnyErrors(errStrings) === false) {
				createFriendGroup(creator, groupName, description);
				members.map((member) => addMemberToGroup(member, groupName, creator)); 
				req.session.success = "You have successfully created the FriendGroup " + groupName;
				res.redirect('/home');
			} else {
				res.render('home', {username: creator, error: true, err: errStrings});
			}
		});
})

// Checking if any errors, count = number of errors
// Null means no error
function checkAnyErrors(errArray) {
	count = 0;
	for (var i = 0; i < errArray.length; i++) {
		if (errArray[i] !== null) count += 1; 
	}
	// Returns true if there are errors
	return (count !== 0); 
}

// Check if group already exists in FriendGroup data base
// If no existing FriendGroup, returns null
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

// Check if member that user is trying to add to FriendGroup exists
// If user exists, returns null
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

// Inserting into FriendGroup database
function createFriendGroup(creator, groupName, description) {
	var query = "INSERT INTO FriendGroup(group_name, username, description) VALUES (?, ?, ?)";
	connection.query(query, [groupName, creator, description], function(err, rows, fields) {
		if (err) throw err;
	});
	return;
}

// Inserting into Member database
function addMemberToGroup(member, group, creator) {
	var query = "INSERT INTO Member(username, group_name, username_creator) VALUES (?, ?, ?)";
	connection.query(query, [member, group, creator], function (err, rows, fields) {
		if (err) throw err;
	});
	return; 
}

// Displaying only one content 
// Shows content's contentInfo, users who were tagged, and comments 
app.get('/content/:id', function(req, res) {
	var id = req.params.id;
	var username = req.session.username;
	return displayContent(id)
		.then((results) => {
			res.render('content', {
				username: username,
				contentInfo: results.contentInfo,
				tagged: results.tagged,
				comments: results.comments,
				error: false
			})
		})
})

function displayContent(id) {
	var content = {}; 
	return Promise.all([getContentInfo(id), getTags(id), getComments(id)])
		.then((results) => {
			content.contentInfo = results[0][0];
			content.tagged = results[1];
			content.comments = results[2];
			return content; 
		})
}

// Gets all attributes from Content database for id
function getContentInfo(id) {
	var query = "SELECT * FROM Content WHERE id = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, id, (err, rows) => {
			if (err) return reject(err);
			resolve(rows);
		})
	})
}

// Gets a person's information from Person database if tagged in content with id = id
function getTags(id) {
	var query = "SELECT first_name, last_name, username_taggee FROM Tag, Person WHERE Tag.username_taggee = Person.username " +
				"AND status IS true AND id = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, id, (err, rows) => {
			if (err) return reject(err);
			if (rows.length === 0) resolve(null);
			else { resolve(rows); }
		})
	})
}

// Gets all comments of a Content with id = id 
function getComments(id) {
	var query = "SELECT * FROM Comment WHERE id = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, id, (err, rows) => {
			if (err) return reject(err);
			if (rows.length === 0) resolve(null);
			else { resolve(rows); }
		})
	})
}

app.post('/content/:contentId/add-tags', function(req, res) {
	var errors = []
	var id = req.params.contentId;
	console.log(req.params);
	var tagger = req.session.username;
	var tagged = (Array.isArray(req.body.tags)) ? req.body.tags : new Array(req.body.tags);
	var usersExist = tagged.map((taggee) => checkUserExists(taggee));
	var checkVisibility = tagged.map((taggee) => checkContentVisible(id, taggee));
	return Promise.all(usersExist) 
		.then((errArray) => {
			errors = errArray
			return checkAnyErrors(errArray);
		})
		.then((isError) => {
			// If there is a tagged user that does not exist, display error on page
			if (isError === true) {
				return displayContent(id).then((results) => {
					res.render('content', {
						username: tagger,
						contentInfo: results.contentInfo,
						tagged: results.tagged,
						comments: results.comments,
						error: true,
						err: errors
					})
				})
			} else {
				// If there is not tagged user that does not exist, continue checking for errors
				// If user is self tagging, insert into Tag with status = true
				// Else if content is visible to tagged user, insert into Tag with status = false
				// Else if content is not visible to tagged user, display error message
				return Promise.all(checkVisibility)
					.then((errArray) => {
						errors = errArray;
						return checkAnyErrors(errArray);
					})
					.then((isError) => {
						// If content is not visible to a tagged user, display error on page
						if (isError === true) {
							return displayContent(id).then((results) => {
								res.render('content', {
									username: tagger,
									contentInfo: results.contentInfo,
									tagged: results.tagged,
									comments: results.comments,
									error: true,
									err: errors
								})
							})
						} else { 
							// Else if no errors, add to Tag table and redirect to content page 
							var tagging = tagged.map((taggee) => addTag(tagger, taggee, id));
							return Promise.all(tagging)
								.then(res.redirect('/content/' + id));
						}
					})
				
			}
		})
})

function checkContentVisible(id, user) {
	var query = "SELECT * FROM Content NATURAL LEFT JOIN Share WHERE id = ? AND (Content.public is true " +
				"OR (group_name, username) IN " +
				"(SELECT group_name, username_creator FROM Member WHERE username = ?))"
	return new Promise((resolve, reject) => {
		connection.query(query, [id, user], (err, rows) => {
			if (err) return reject(err);
			// If rows = 0, content is not visible to user (resolve errString)
			// Else, content is visible to user (resolved to null)
			if (rows.length === 0) {
				var errString = "The content is not visible to " + user;
				resolve(errString);
			} else { resolve(null); }
		})
	})
}

function addTag(tagger, taggee, id) {
	var status = (tagger === taggee);
	var query = "INSERT INTO Tag(id, username_tagger, username_taggee, status) VALUES (?, ?, ?, ?)"; 
	connection.query(query, [id, tagger, taggee, status], function(err, rows, fields) {
		if (err) throw err;
	})
}


app.post('/content/:contentId', function(req, res) {
	var comment = req.body.comment;
	var username = req.session.username;
	var id = req.params.contentId;
	var query = "INSERT INTO Comment(id, username, comment_text) VALUES (?, ?, ?)";
	connection.query(query, [id, username, comment], function(err, rows, fields) {
		if (err) throw err; 
	})
	res.redirect('/content/' + id);
})

// Separate FriendGroups that user has created from FriendGroups user is a member of
// Display FriendGroup name, description, creator (if not user), and members 
app.get('/FriendGroups', function(req, res) {
	var username = req.session.username;
	var FriendGroups = req.session.FriendGroups;
	var ownedByUser = FriendGroups.filter(group => group.username_creator === group.username);
	var memberOfGroup = FriendGroups.filter(group => group.username_creator !== group.username);
	getUserTags(username)
		.then((tags) => {
			return res.render('friendGroups', {
				username: username, 
				ownedByUser: ownedByUser,
				memberOfGroup: memberOfGroup,
				pendingTags: tags
			})
		})
})

app.post('/tag/:tagId', function(req, res) {
	var status = req.body['tag-status'];
	var username = req.session.username;
	var id = req.params.tagId;
	if (status === 'Approve') {
		var query = "UPDATE Tag SET status = true WHERE id = ? AND username_taggee = ?";
		connection.query(query, [id, username], function(err, rows, fields) {
			if (err) throw err;
		})
	} else { // tag declined, delete entry from Tag table 
		var query = "DELETE FROM Tag WHERE id = ? AND username_taggee = ?";
		connection.query(query, [id, username], function(err, rows, fields) {
			if (err) throw err;
		})
	}
	return res.redirect('/FriendGroups');
})

function getUserTags(username) {
	var query = "SELECT Content.id, username_tagger, username_taggee, Tag.timest " +
				"FROM Tag, Content WHERE Tag.id = Content.id AND username_taggee = ? AND status IS false";
	return new Promise((resolve, reject) => {
		connection.query(query, username, (err, rows) => {
			if (err) return reject(err);
			if (rows.length === 0) resolve(null);
			else { resolve(rows); }
		})
	})
}

// Gets FriendGroups that user is a member of (includes FriendGroups user has created)
function getFriendGroups(user) {
	var query = "SELECT Member.username, FriendGroup.group_name, username_creator, description " +
				"FROM Member, FriendGroup WHERE FriendGroup.group_name = Member.group_name " +
				"AND Member.username_creator = FriendGroup.username AND Member.username = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, [user, user], (err, rows) => {
			if (err) return reject(err);
			if (rows.length === 0) resolve(null);
			else { resolve(rows); }
		});
	})
}

function getMembersOfGroup(FriendGroup) {
	var group_name = FriendGroup.group_name;
	var creator = FriendGroup.username_creator;
	var query = "SELECT DISTINCT Member.username, first_name, last_name FROM Member NATURAL JOIN Person, FriendGroup " +
				"WHERE Member.username_creator = FriendGroup.username AND Member.group_name = FriendGroup.group_name " +
				"AND FriendGroup.group_name = ? AND FriendGroup.username = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, [group_name, creator], (err, rows) => {
			if (err) return reject(err);
			resolve(rows); 
		})
	})
}

app.post('/add-member', function(req, res) {
	var creator = req.session.username;
	// TODO: pass in groupName to POST 
	var groupName; 
	var errors = [];
	var newMembers = (Array.isArray(req.body.members)) ? req.body.members : new Array(req.body.members);
	var usersExist = newMembers.map((member) => checkUserExists(member));
	var alreadyMember = newMembers.map((member) => checkUserIsMember(member, groupName, creator));
	var promises = usersExist.concat(alreadyMember);
	Promise.all(promises)
		.then((errStrings) => {
			errors = errStrings;
			return checkAnyErrors(errors);
		});
		.then((isError) => {
			if (isError === true) {
				// TODO: figure out a way to stop repeating code to display error messages 
				var FriendGroups = req.session.FriendGroups;
				var ownedByUser = FriendGroups.filter(group => group.username_creator === group.username);
				var memberOfGroup = FriendGroups.filter(group => group.username_creator !== group.username);
				getUserTags(username)
					.then((tags) => {
						return res.render('friendGroups', {
							username: username, 
							ownedByUser: ownedByUser,
							memberOfGroup: memberOfGroup,
							pendingTags: tags,
							error: true,
							err: errors
						})
					})
			} else {
				// No errors, insert into member database and redirect 
				// TODO: display success message 
				newMembers.map((member) => addMemberToGroup(member, groupName, creator));
				res.redirect('/FriendGroups');
			}
		})
})

// Checks if user is already a member of the FriendGroup
// If there exists an entry in Member with same group_name and username_creator, return error message
// Else return null to indicate no error
function checkUserIsMember(username, groupName, creator) {
	var query = "SELECT * FROM Member WHERE group_name = ? AND username_creator = ? AND username = ?";
	return new Promise((resolve, reject) => {
		connection.query(query, [groupName, creator, username], (err, rows) => {
			if (err) return reject(err);
			if (rows.length > 0) {
				var errString = "The user " + username + " is already a member of the FriendGroup, " + groupName;
				resolve(errString);
			} else {
				resolve(null);
			}
		})
	})
}

app.get('/logout', function(req, res) {
	req.session.destroy();
	res.redirect('/');
})

app.listen(3000, () => console.log("Server running at http://localhost:3000/"));
