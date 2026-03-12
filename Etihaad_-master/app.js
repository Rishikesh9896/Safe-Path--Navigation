var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var passport=require("passport");
var methodOverride= require("method-override");
var path = require('path');
var session = require('express-session');

// User data storage (in production, use a database)
var users = {
	user1: {
		id: 'user1',
		username: 'rishi',
		password: 'password123',
		name: 'Rishi Kumar',
		email: 'rishi@gmail.com',
		joinDate: '2024-01-15',
		routes: [
			{name: 'Delhi to Noida', distance: 35, incidents: 2, date: '2024-12-01'},
			{name: 'Gurgaon Loop', distance: 42, incidents: 1, date: '2024-12-02'},
			{name: 'Airport Road', distance: 28, incidents: 3, date: '2024-12-03'}
		],
		totalIncidentsReported: 6,
		totalDistance: 105,
		placesVisited: ['Delhi', 'Noida', 'Gurgaon', 'Airport Road']
	},
	user2: {
		id: 'user2',
		username: 'akshita',
		password: 'password123',
		name: 'Akshita Singh',
		email: 'akshita@etihaad.com',
		joinDate: '2024-02-20',
		routes: [
			{name: 'Connaught Place Loop', distance: 15, incidents: 1, date: '2024-12-03'},
			{name: 'Chandni Chowk Route', distance: 22, incidents: 2, date: '2024-12-04'}
		],
		totalIncidentsReported: 3,
		totalDistance: 37,
		placesVisited: ['Delhi', 'Connaught Place', 'Chandni Chowk']
	}
};

app.use(session({
	secret: 'etihaad-secret',
	resave: false,
	saveUninitialized: true
}));

app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");

app.use(express.static(__dirname+"/public"));
app.use(methodOverride("_method"));

// Middleware to set current user
app.use(function(req, res, next){
	res.locals.user = req.session.userId ? users[req.session.userId] : null;
	next();
});

// Authentication check middleware
function isLoggedIn(req, res, next){
	if(req.session.userId && users[req.session.userId]){
		next();
	} else {
		res.redirect("/login");
	}
}

app.get("/", function(req, res){
	if(req.session.userId){
		res.render("dashboard");
	} else {
		res.redirect("/login");
	}
});
app.get("/login", function(req, res){
	res.render("login", {error: null});
});
app.get("/signup", function(req, res){
	res.render("signup", {error: null});
});
app.post("/signup", function(req, res){
	var username = req.body.username;
	var password = req.body.password;
	var name = req.body.name || username;
	var email = req.body.email || username + '@etihaad.com';
	
	// Check if user exists
	for(var id in users){
		if(users[id].username === username){
			return res.render("signup", {error: "Username already exists!"});
		}
	}
	
	// Create new user
	var newUserId = 'user' + (Object.keys(users).length + 1);
	users[newUserId] = {
		id: newUserId,
		username: username,
		password: password,
		name: name,
		email: email,
		joinDate: new Date().toISOString().split('T')[0],
		routes: [],
		totalIncidentsReported: 0,
		totalDistance: 0,
		placesVisited: []
	};
	
	req.session.userId = newUserId;
	res.redirect("/dashboard");
});
app.post("/login", function(req, res){
	var username = req.body.username;
	var password = req.body.password;
	
	// Find user
	for(var id in users){
		if(users[id].username === username && users[id].password === password){
			req.session.userId = id;
			return res.redirect("/dashboard");
		}
	}
	
	res.render("login", {error: "Invalid username or password!"});
});
app.get("/logout", function(req, res){
	req.session.destroy(function(err){
		if(err){
			return res.send("Error logging out");
		}
		res.redirect("/login");
	});
});
app.get("/maps", isLoggedIn, function(req, res){
	res.sendFile(path.join(__dirname + '/MapAndLoc.html'));
});

app.get("/dashboard", isLoggedIn, function(req, res){
	var orig = users[req.session.userId] || {routes: [], placesVisited: []};
	// create a shallow copy to avoid mutating in-memory data
	var user = JSON.parse(JSON.stringify(orig));
	// derive totals from routes if available
	if(Array.isArray(user.routes) && user.routes.length){
		user.totalDistance = user.routes.reduce(function(s, r){ return s + (r.distance || 0); }, 0);
		user.totalIncidentsReported = user.routes.reduce(function(s, r){ return s + (r.incidents || 0); }, 0);
		// ensure placesVisited exists
		if(!Array.isArray(user.placesVisited) || user.placesVisited.length === 0){
			user.placesVisited = user.routes.map(function(r){ return r.name; });
		}
	} else {
		user.totalDistance = user.totalDistance || 0;
		user.totalIncidentsReported = user.totalIncidentsReported || 0;
		user.placesVisited = user.placesVisited || [];
	}
	// cap display distance at a sensible max if needed (we use 100km target for progress)
	user.displayTotalDistance = Math.min(user.totalDistance, 100);

	res.render("dashboard", {user: user});
});

app.get("/analytics", isLoggedIn, function(req, res){
	try {
		var fs = require('fs');
		var dataFile = fs.readFileSync('./data/data.json', 'utf8');
		var dataContent = dataFile.replace(/^data\s*=\s*/, '').trim();
		var jsonStr = dataContent.replace(/'/g, '"');
		var data = JSON.parse(jsonStr);
		
		var magCount = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0};
		data.forEach(item => magCount[item.properties.mag]++);
		
		var orig = users[req.session.userId] || {routes: [], placesVisited: []};
		var user = JSON.parse(JSON.stringify(orig));
		if(Array.isArray(user.routes) && user.routes.length){
			user.totalDistance = user.routes.reduce(function(s, r){ return s + (r.distance || 0); }, 0);
			user.totalIncidentsReported = user.routes.reduce(function(s, r){ return s + (r.incidents || 0); }, 0);

			// Compute yearly incident counts from user's routes (if dates are present)
			var now = new Date();
			var currentYear = now.getFullYear();
			var years = [];
			for(var y = currentYear - 5; y <= currentYear; y++) years.push(y);
			var yearlyMap = {};
			years.forEach(function(yr){ yearlyMap[yr] = 0; });
			user.routes.forEach(function(r){
				var yr = null;
				try {
					if(r.date){
						// date may be yyyy-mm-dd or other string
						var d = new Date(r.date);
						if(!isNaN(d.getTime())) yr = d.getFullYear();
						else if(typeof r.date === 'string' && r.date.length >= 4) yr = parseInt(r.date.slice(0,4));
					}
				} catch(e) { yr = null; }
				if(yr && yearlyMap.hasOwnProperty(yr)) yearlyMap[yr] += (r.incidents || 0);
			});
			var yearlyCounts = years.map(function(yr){ return yearlyMap[yr] || 0; });

			// If there is very little yearly data, synthesize a friendly decreasing demo series
			var totalSum = yearlyCounts.reduce(function(s,v){ return s+v; }, 0);
			if(totalSum === 0){
				// create a demo decreasing series ending at user's totalIncidentsReported
				var demoStart = Math.max(50, (user.totalIncidentsReported || 0) + 40);
				yearlyCounts = years.map(function(yr, idx){
					// linear decrease over the years
					var t = idx / Math.max(1, years.length-1);
					return Math.round(demoStart * (1 - 0.8 * t));
				});
				// make last year closer to user's reported incidents if available
				if(user.totalIncidentsReported){ yearlyCounts[yearlyCounts.length-1] = user.totalIncidentsReported; }
			}

		} else {
			user.totalDistance = user.totalDistance || 0;
			user.totalIncidentsReported = user.totalIncidentsReported || 0;
		}

		res.render("analytics", {
			stats: magCount,
			totalCrimes: data.length,
			user: user,
			years: years,
			yearlyCounts: yearlyCounts
		});
	} catch(err) {
		console.log("Error reading analytics:", err);
		// Ensure we still provide a user object with computed totals if possible
		var origUser = users[req.session.userId] || {routes: []};
		var fallbackUser = JSON.parse(JSON.stringify(origUser));
		if(Array.isArray(fallbackUser.routes) && fallbackUser.routes.length){
			fallbackUser.totalDistance = fallbackUser.routes.reduce(function(s, r){ return s + (r.distance || 0); }, 0);
			fallbackUser.totalIncidentsReported = fallbackUser.routes.reduce(function(s, r){ return s + (r.incidents || 0); }, 0);
		} else {
			fallbackUser.totalDistance = fallbackUser.totalDistance || 0;
			fallbackUser.totalIncidentsReported = fallbackUser.totalIncidentsReported || 0;
		}

		// compute demo yearly series when data file is unavailable
		var now = new Date();
		var currentYear = now.getFullYear();
		var years = [];
		for(var y = currentYear - 5; y <= currentYear; y++) years.push(y);
		var yearlyCounts = years.map(function(yr, idx){ return Math.max(0, Math.round(60 * (1 - (idx/(years.length-1)) * 0.8))); });
		if(fallbackUser.totalIncidentsReported){ yearlyCounts[yearlyCounts.length-1] = fallbackUser.totalIncidentsReported; }

		res.render("analytics", {
			stats: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0},
			totalCrimes: 0,
			user: fallbackUser,
			years: years,
			yearlyCounts: yearlyCounts
		});
	}
});

app.get("/stats", isLoggedIn, function(req, res){
	try {
		var fs = require('fs');
		var dataFile = fs.readFileSync('./data/data.json', 'utf8');
		var dataContent = dataFile.replace(/^data\s*=\s*/, '').trim();
		var jsonStr = dataContent.replace(/'/g, '"');
		var data = JSON.parse(jsonStr);
		
		var magCount = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0};
		data.forEach(item => magCount[item.properties.mag]++);
		res.render("stats", {stats: magCount});
	} catch(err) {
		console.log("Error reading stats:", err);
		res.render("stats", {stats: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}});
	}
});

app.listen(3001, function(){
    console.log("Ehtihaad Bartein ~(^_^)~");

});
