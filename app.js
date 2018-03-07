var mysql	     =	 require('mysql');
var ejs 	     =	 require('ejs');
var express      =	 require('express');
var bodyParser   =	 require('body-parser');
var jwt 	     =	 require('jsonwebtoken');
var cookieParser =   require('cookie-parser');
var flash 		 = 	 require('connect-flash');
var session 	 =	 require('express-session');
var app 	     =	 express();
var moment 		 = 	 require('moment');

moment().format();

var secret = 'MOHITSECRETSAUCE';

app.set('view engine', 'ejs');
app.set('views',__dirname+'/public/views');

app.use(cookieParser('secret'));
app.use(session({cookie: { maxAge: 60000 }}));
app.use(flash());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());

var connection = mysql.createConnection({
  host     : '127.0.0.1',
  user     : 'root',
  password : 'root',
  database : 'dbmsproject'
});

var cities = ['MUMBAI',"DELHI","KOLKATA","CHENNAI","BANGALORE","HYDERABAD","AHMEDABAD","PUNE"];

// ---------INITIALISE FLIGHT SCHEDULE DATABASE FUNCTION-------


//make a flights prepopulate function, which will add flights to the database, one month ahead.
// initialisefs();       //only run once for initialisation

updatefs(); //updates the fight_schedules table with one month of flight schedules

// ---------------------ROUTES--------------------//

// Home Page
app.get("/",function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	connection.query("select * from flights INNER JOIN flights_schedule ON flights.fid = flights_schedule.fid",function(err,flights,field){
		res.render('index',{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg,flights:flights,cities:cities,moment:moment,passengers:1});
	});
});
//add booking functionlatiy
app.post("/",verifyToken,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	if(req.body.deptdate){
		//if date is provided, find the flight
		connection.query("select * from flights INNER JOIN flights_schedule ON flights.fid = flights_schedule.fid where deptcity=? AND arrivalcity=? AND deptdate=?",[req.body.deptcity,req.body.arrivalcity,moment(req.body.deptdate).format("YYYY-MM-DD")],function(err,flights,field){
			if(err){throw err;}
			res.render('index',{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg,flights:flights,cities:cities,moment:moment,passengers:req.body.passengers});
		});
	}else{//else show all the flights between the cities
		connection.query("select * from flights INNER JOIN flights_schedule ON flights.fid = flights_schedule.fid where deptcity=? AND arrivalcity=?",[req.body.deptcity,req.body.arrivalcity],function(err,flights,field){
			if(err){throw err;}
			res.render('index',{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg,flights:flights,cities:cities,moment:moment,passengers:req.body.passengers});
		});
	}
});
//Booking routes
app.get("/book/:fsid/:p",verifyToken,function(req,res){
	var fsid = req.params.fsid;
	var p = req.params.p;
	connection.query("select * from flights INNER JOIN flights_schedule ON flights.fid = flights_schedule.fid where fsid=?",[fsid],function(err,flights,field){
		if(err){throw err}
			connection.query("select * from bookings where fsid=?",[fsid],function(err,bookings,field){
				if(err){throw err};
				if(bookings.length<0){
					res.render('book',{isLoggedin:req.cookies.isLoggedin,flight:flights[0],moment:moment,passengers:p,reservedseats:0});
				}else{
					var reservedseats="";
					bookings.forEach(function(booking){
						reservedseats= reservedseats.concat(",",booking.reservedseats);
					});
					res.render('book',{isLoggedin:req.cookies.isLoggedin,flight:flights[0],moment:moment,passengers:p,reservedseats:reservedseats});
				}
			});
	});
});

app.post("/book/:fsid/:p",verifyToken,function(req,res){
	var fsid=req.params.fsid;
	var passengers = req.params.p;
	var seats = req.body.seats;
	seats = seats.toString();	
	connection.query("insert into bookings (userid,fsid,reservedseats,passengers) values(?,?,?,?)",[getUserid(req),fsid,seats,passengers],function(err,rows,field){
		if(err){throw err;}
		req.flash("positiveMessage","Booked Successfully.");
		res.redirect("/bookings");
	});
});

app.get("/bookings",verifyToken,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var id = getUserid(req);
	connection.query("select * from bookings INNER JOIN flights_schedule on bookings.fsid = flights_schedule.fsid INNER JOIN flights on flights.fid = flights_schedule.fid where bookings.userid=?",[id],function(err,bookings,field){
		res.render("bookings",{positiveMessage:msg,errorMessage:emsg,isLoggedin:req.cookies.isLoggedin,bookings:bookings,moment:moment});
	});
});

app.get("/bookings/cancel/:bid",verifyToken,function(req,res){
	var bid = req.params.bid;
	connection.query("delete from bookings where bid=?",[bid],function(err,rows,field){
		if(err){throw err;}
	})
	req.flash("positiveMessage","Cancelled Booking.");
	res.redirect("/bookings");
});

// Registration routes
app.get("/register",function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
		if(!req.cookies.isLoggedin){
			res.render('register',{positiveMessage:msg,errorMessage:emsg});
		}else{
			res.redirect('/user');
		}
});

app.post("/register",verifyRegData,function(req,res){
	var vals = [req.body.username,req.body.password,req.body.email,req.body.number]
	connection.query("insert into users (username,password,email,number) values (?,?,?,?)",vals,function(err,rows,field){
		if(!err){
		req.flash('positiveMessage','Registered Successfully');
		res.redirect("/login");
	}else{
		req.flash('errorMessage',"Registration Error");
		req.redirect('/register');
	}
	});
});


// User Profile Editing routes
app.get("/user",verifyToken,function(req,res){
	findUserByUsername(getUsername(req)).then(function(row){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
		var user = row[0];
		delete user.password;
		res.render('user',{user,isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg});
	})
});	

app.post("/user",verifyToken,verifyUserData,function(req,res){
	//we want to update the row for the given user 
	//we find the user by his name
	var username = getUsername(req);
	var password = req.body.password;
	var email    = req.body.email;
	var number   = req.body.number;
	connection.query('update users set password = ?,email=?,number=? where username=?',[password,email,number,username]);
	req.flash("positiveMessage","User Details updated Successfully.");
	res.redirect("/");
});



// Login routes
app.get("/login",function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
		if(!req.cookies.isLoggedin){
			res.render('login',{positiveMessage:msg,errorMessage:emsg});
		}else{
			res.redirect('/user');
		}
});

app.post('/login',function(req,res){
	findUserByUsername(req.body.username).then(function(row){
		var user = row[0];
		if(user){
			if(user.password == req.body.password){  //if user exists in the database, match passwords and generate and return a token
				delete user.password;
				delete user.number;
				delete user.email;
				var token = jwt.sign({user},secret);
				// res.send({token:token,username:user.username});
				res.cookie('jwtToken', token);
				res.cookie('isLoggedin',true);
				req.flash("positiveMessage","Logged in Successfully.");
				if(user.username == "admin"){ //if user is admin, redirect to admin page
					res.redirect('/admin/users');
				}else{
					res.redirect("/");        //else go to home page 
				}
			}else{
				res.render('login',{errorMessage:"Incorrect Password"});
			}
		}
		else{
			res.render('login',{errorMessage:"Username not found"});
		}
	});

});


// Logout route
app.get("/logout",function(req,res){
	res.clearCookie('jwtToken');
	res.clearCookie('isLoggedin');
	req.flash("positiveMessage","You have been logged out.")
	res.redirect('/login');
})

//---------- Admin routes------------
//admin users route
app.get("/admin/users",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	connection.query("SELECT * FROM USERS",function(err,rows,field){
		res.render("users",{isLoggedin:req.cookies.isLoggedin,rows:rows,positiveMessage:msg,errorMessage:emsg});
	});
});



// Admin - new user routes
app.get("/admin/users/new",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	res.render("newuser",{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg});
});

app.post("/admin/users/new",verifyToken,verifyAdmin,verifyNewData,function(req,res){
	var vals = [req.body.username,req.body.password,req.body.email,req.body.number]
	connection.query("insert into users (username,password,email,number) values (?,?,?,?)",vals,function(err,row,field){
		req.flash('positiveMessage','Added Successfully');
		res.redirect("/admin/users");
	});
});


// Admin- edit user routes
app.get("/admin/users/edit/:username",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	findUserByUsername(req.params.username).then(function(row){
		var user = row[0];
		res.render('edituser',{user,isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg});
	})
});

app.post("/admin/users/edit/:username",verifyToken,verifyAdmin,verifyUserEditData,function(req,res){
	var vals = [req.body.username,req.body.password,req.body.email,req.body.number,req.body.id];
	connection.query("UPDATE users set username=?,password=?,email=?,number=? where id=?",vals,function(err,rows,field){
		if(err){
			console.log(err);
			throw err;
		}
		req.flash('positiveMessage','User Edited');
		res.redirect("/admin/users");
	});
});


// Admin - Delete users route
app.get("/admin/users/delete/:id",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var id = req.params.id;
	connection.query("DELETE FROM USERS WHERE ID=?",[id],function(err,rows,fields){
		if(err){
			req.flash("errorMessage","Error");
			res.redirect("/admin/users");
		}else{
			req.flash("positiveMessage","Deleted");
			res.redirect("/admin/users");
		}
	})
});

app.get("/admin/flights",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	connection.query("SELECT * FROM FLIGHTS",function(err,rows,field){
		res.render("flights",{isLoggedin:req.cookies.isLoggedin,rows:rows,positiveMessage:msg,errorMessage:emsg});
	});
});

app.get("/admin/flights/new",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	res.render("newflight",{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg});
});

app.post("/admin/flights/new",verifyToken,verifyAdmin,verifyNewData,function(req,res){
	var vals = [req.body.deptcity,req.body.arrivalcity,req.body.seats,req.body.intervaldays,req.body.departuretime,req.body.duration,req.body.cost];
	// vals.forEach(function(val){
		// console.log(val);
	// })
	connection.query("insert into flights (deptcity,arrivalcity,seats,intervaldays,departuretime,duration,cost) values (?,?,?,?,?,?,?)",vals,function(err,rows,field){
		if(err){
			console.log("NEW FLIGHT error");
			throw err;
		}
		var fid = rows.insertId;
		var today = moment().hour(0).minute(0).second(0);
		connection.query("insert into flights_schedule (fid,seats,deptdate) values (?,?,?)",[fid,vals[2],today.format("YYYY-MM-DD")],function(err,rows,field){
			updatebyfid(fid);
			req.flash('positiveMessage','Added Successfully');
			res.redirect("/admin/flights");
		});
	});
});

app.get("/admin/flights/delete/:fid",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var fid = req.params.fid;
	connection.query("DELETE from flights where fid=?",[fid],function(err,rows,fields){
		if(err){
			req.flash("errorMessage","Error");
			res.redirect("/admin/flights");
			console.log('Flight Deletion Error');
			throw err;
		}else{
			req.flash("positiveMessage","Deleted");
			res.redirect("/admin/flights");
		}
		//also we will have to delete flights from the schedule
		connection.query("delete from flights_schedule where fid=?",[fid]);
	})
});

app.get("/admin/flights/edit/:fid",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var fid = req.params.fid;
	connection.query("select * from flights where fid=?",[fid],function(err,rows,field){
		if(err){
			console.log("Flight data GET Error");
			throw err;
		}
		var flight=rows[0];
		res.render("editflight",{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg,flight:flight})
	});
});

app.post("/admin/flights/edit/:fid",verifyToken,verifyAdmin,function(req,res){
	var arr = Object.keys(req.body).map(function(key){
		return req.body[key];
	});
	arr.push(req.params.fid);
	connection.query("update flights set deptcity=?,arrivalcity=?,seats=?,intervaldays=?,departuretime=?,duration=?,cost=? where fid=?",arr,function(err,rows,field){
		if(err){
			console.log(err);
			throw err;
		}
		req.flash("positiveMessage","Flight Updated.");
		res.redirect("/admin/flights");
	})
});

app.get("/admin/bookings",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	connection.query("select * from bookings INNER JOIN flights_schedule on bookings.fsid = flights_schedule.fsid INNER JOIN flights on flights.fid = flights_schedule.fid INNER JOIN users on users.id=bookings.userid;",function(err,bookings,field){
		res.render("adminbookings",{isLoggedin:req.cookies.isLoggedin,bookings:bookings,positiveMessage:msg,errorMessage:emsg});
	});
});

app.get("/admin/bookings/delete/:bid",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var bid = req.params.bid;
	connection.query("DELETE from bookings where bid=?",[bid],function(err,rows,fields){
		if(err){
			req.flash("errorMessage","Error");
			res.redirect("/admin/bookings");
			console.log('Booking Deletion Error');
			throw err;
		}else{
			req.flash("positiveMessage","Deleted");
			res.redirect("/admin/bookings");
		}
	})
});


app.get("/admin/bookings/edit/:bid",verifyToken,verifyAdmin,function(req,res){
	var msg = req.flash('positiveMessage')[0];
	var emsg = req.flash('errorMessage')[0];
	var bid = req.params.bid;
	connection.query("select * from bookings where bid=?",[bid],function(err,rows,field){
		if(err){
			console.log("Booking data GET Error");
			throw err;
		}
		var booking=rows[0];
		res.render("editbooking",{isLoggedin:req.cookies.isLoggedin,positiveMessage:msg,errorMessage:emsg,booking:booking})
	});
});


app.post("/admin/bookings/edit/:bid",verifyToken,verifyAdmin,function(req,res){
	var arr=[req.body.fsid,req.body.reservedseats,req.params.bid];
	connection.query("update bookings set fsid=?,reservedseats=? where bid=?",arr,function(err,rows,field){
		if(err){throw err;}
		req.flash("positiveMessage","Booking Updated.");
		res.redirect("/admin/bookings");
	})
});


// Default admin route
app.get('/admin',function(req,res){
	res.redirect("/admin/users");
});


// 404 Redirect routes
app.get('*',function(req,res){
	res.redirect('/');
})

app.listen(3000,function(){
	console.log('Listening to port 3000');
})

function findUserByUsername(username){
	return new Promise(function(resolve,reject){
		connection.query("select * from users where username=?",[username], function (err, rows, fields) {
		 	if (err) {
		  		console.log(err,"findUserByUsername error");
		  		throw err;	
		  		return reject(err);
		  	}
		  	else{
		  		resolve(rows);
		  	}
		});
	});
}

function verifyToken(req,res,next){
	var token = req.cookies.jwtToken;
	if(token){
		jwt.verify(token,secret,function(err,data){
			if(err){
				console.log(err,"Token Veify Error");
				throw err;
			}
		});
		next();
	}else{
		req.flash("errorMessage","You need to login first.");
		res.redirect("/login");
	}
}

function verifyAdmin(req,res,next){
	//only admin is allowed to access this route
	var username = getUsername(req);
	if(username!="admin"){
		req.flash("errorMessage","You cannot access that page.");
		res.redirect("/");
	}else{
		next();
	}
}

function verifyRegData(req,res,next){
	var rb = req.body;
	connection.query("select * from users where username=? OR email=? OR number=?",[rb.username,rb.email,rb.number],function(err,rows,field){
		if(rows.length>0){//this is an error
			var user = rows[0];
			if(user.username == rb.username){
				req.flash('errorMessage','Username used already, try using other username.');
			}else if(user.email==rb.email){
				req.flash('errorMessage','Email already used by someone else.');
			}else if(user.number==rb.number){
				req.flash('errorMessage','Number used by someone else.');
			}
			res.redirect('/register');
		}else{
			next();
		}
	});
}

function verifyNewData(req,res,next){
	var rb = req.body;
	connection.query("select * from users where username=? OR email=? OR number=?",[rb.username,rb.email,rb.number],function(err,rows,field){
		if(rows.length>0){//this is an error
			var user = rows[0];
			if(user.username == rb.username){
				req.flash('errorMessage','Username used already, try using other username.');
			}else if(user.email==rb.email){
				req.flash('errorMessage','Email already used by someone else.');
			}else if(user.number==rb.number){
				req.flash('errorMessage','Number used by someone else.');
			}
			res.redirect('/admin/users/new');
		}else{
			next();
		}
	});
}

function verifyUserData(req,res,next){
	var rb = req.body;
	var username = getUsername(req);
	connection.query("select * from users where (email=? OR number=?) AND username!=?",[rb.email,rb.number,username],function(err,rows,field){
		if(rows.length>0){
			req.flash('errorMessage','Either Email or Number has already been used.');
			res.redirect('/user');
		}else{
			next();
		}
	});
}

function verifyUserEditData(req,res,next){
	var rb = req.body;
	connection.query("select * from users where (username=? OR email=? OR number=?) AND id!=?",[rb.username,rb.email,rb.number,rb.id],function(err,rows,field){
		if(rows.length>0){
			req.flash('errorMessage',"Either username or email or password is already used.");
			res.redirect('/admin/users/edit/'+req.params.username);
		}else{
			next();
		}
	});
}

function getUsername(req){
	return decode(req.cookies.jwtToken).user.username;
}

function getUserid(req){
	return decode(req.cookies.jwtToken).user.id;
}

function decode(token){
	return jwt.decode(token);
}

function initialisefs(){
	//get the flights one by one and add them to schedule until one month ahead
	connection.query("select * from flights",function(err,flights,field){
		flights.forEach(function(flight){
			populatebyfid(flight.fid);
		});
	});
}


function populatebyfid(fid){
	//initialise the times
	var now = moment().hour(0).minute(0).second(0);
	var month = now.clone().add(1,'month');
	
	connection.query("select * from flights where fid=?",[fid],function(err,row,field){
		var flight = row[0];
		var interval = flight.intervaldays;
		while(month.diff(now,'days')>0){   //while we havent reached next month's date
			connection.query("insert into flights_schedule (fid,seats,deptdate) values (?,?,?)",[flight.fid,flight.seats,now.format("YYYY-MM-DD")],function(err,rows,field){
				if(err){
					console.log("Population Error");
					throw err;
				}
			});
			now.add(interval,'days');
		}
	});
}

function updatefs(){
		connection.query("select * from flights",function(err,flights,field){
			if(err){throw err;}
			flights.forEach(function(flight){
				updatebyfid(flight.fid);
			});
		});
}


function updatebyfid(fid){
	//initialise the times
	var month = moment().hour(0).minute(0).second(0).add(1,'month');

	//delete all the flights which are before the today's date.
	var today = moment().hour(0).minute(0).second(0);
	connection.query("delete from flights_schedule where deptdate<?",[today.format('YYYY-MM-DD')],function(err){
		if(err){
			console.log("flight deleteion error");
			throw err;
		}
	});

	//add new flight schedules for the current fid flight to the end of the next month date
	connection.query("select intervaldays from flights where fid=?",[fid],function(err,rows,field){
		var intervaldays = rows[0].intervaldays;
		connection.query("select * from flights_schedule where fid=? AND deptdate=(select max(deptdate) from flights_schedule where fid=?);",[fid,fid],function(err,rows,field){
			var flight = rows[0];
			flight.interval = intervaldays;  //if you get error here, check that all of your flights have atleast one schedule in flights_schedule 27/09/17
			var lastScheduledDate = moment(rows[0].deptdate).add(flight.interval,'days');

			while(month.diff(lastScheduledDate,'days')>0){
				connection.query("insert into flights_schedule (fid,seats,deptdate) values (?,?,?)",[flight.fid,flight.seats,lastScheduledDate.format("YYYY-MM-DD")],function(err,rows,field){
					if(err){
						console.log('Flight Update Error');
						throw err;
					}
				});
				lastScheduledDate.add(flight.interval,'days');
			}
		});
	});
}
// booking
// todo - after getting booking implemented check this test case of deleting flights
	//cancel all the bookings for the users for those flights