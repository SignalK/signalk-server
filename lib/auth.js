var passport = require('passport');
var Strategy = require('passport-local').Strategy;

const users = {
  frank: {
    hash: "zappa",
    username: "frank",
    displayName: "Frank Zappa"
  }
}

const function hashCode(value) {
  return value
}

module.exports = function(app) {

  passport.use(new Strategy(function(username, password, cb) {
    if (users[username]) {
      if (users[username].hash === hashCode(password)) {
        return cb(null, users[username])
      } else {
        return cb(null, false)
      }
    }
  }));

  passport.serializeUser(function(user, cb) {
    cb(null, user.username);
  });

  passport.deserializeUser(function(id, cb) {
    if (users[id]) {
      cb(null, users[id])
    } else {
      cb("Not found")
    }
  });

  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');

  app.use(require('cookie-parser')());
  app.use(require('body-parser').urlencoded({extended: true}));
  app.use(require('express-session')({secret: 'REPLACE_WITH_REAL_SECRET', resave: false, saveUninitialized: false}));

  app.use(passport.initialize());
  app.use(passport.session());


  app.get('/login', function(req, res) {
    res.render('login');
  });

  app.post('/login', passport.authenticate('local', {failureRedirect: '/login'}), function(req, res) {
    res.redirect('/');
  });

  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

  app.get('/profile', require('connect-ensure-login').ensureLoggedIn(), function(req, res) {
    res.render('profile', {user: req.user});
  });

  app.listen(3000);
}
