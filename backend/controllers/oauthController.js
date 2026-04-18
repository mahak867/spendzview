/**
 * OAuth Controller — Google Sign-In support
 *
 * Configuration: Set these environment variables before going live:
 *   GOOGLE_CLIENT_ID     = your Google OAuth client ID
 *   GOOGLE_CLIENT_SECRET = your Google OAuth client secret
 *   APP_BASE_URL         = e.g. https://yourdomain.com
 *
 * Uses passport-google-oauth20. The /api/auth/google routes handle the OAuth flow.
 */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const db = require('../models/db');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'GOOGLE_CLIENT_ID_PLACEHOLDER';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'GOOGLE_CLIENT_SECRET_PLACEHOLDER';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const DEMO_MODE = !process.env.GOOGLE_CLIENT_ID;

if (!DEMO_MODE) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${APP_BASE_URL}/api/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const googleId = profile.id;
      const name = profile.displayName;
      const avatar = profile.photos?.[0]?.value;

      if (!email) return done(new Error('No email from Google'), null);

      let user = db.prepare('SELECT * FROM users WHERE google_id=?').get(googleId);
      if (!user) user = db.prepare('SELECT * FROM users WHERE email=?').get(email);

      if (user) {
        if (!user.google_id) {
          db.prepare('UPDATE users SET google_id=?, avatar_url=? WHERE id=?').run(googleId, avatar, user.id);
        }
      } else {
        const hash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
        const result = db.prepare('INSERT INTO users (name, email, password, google_id, avatar_url) VALUES (?,?,?,?,?)').run(name, email, hash, googleId, avatar);
        user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
      }

      const { password: _, ...safeUser } = user;
      done(null, safeUser);
    } catch (e) {
      done(e, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const user = db.prepare('SELECT id, name, email, phone, currency, monthly_income, plan, google_id, avatar_url FROM users WHERE id=?').get(id);
    done(null, user || false);
  });
}

exports.initPassport = (app) => {
  if (!DEMO_MODE) {
    app.use(passport.initialize());
    app.use(passport.session());
  }
};

exports.googleAuth = (req, res, next) => {
  if (DEMO_MODE) {
    return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

exports.googleCallback = (req, res, next) => {
  if (DEMO_MODE) return res.redirect('/?error=oauth_not_configured');
  passport.authenticate('google', { failureRedirect: '/?error=oauth_failed' }, (err, user) => {
    if (err || !user) return res.redirect('/?error=oauth_failed');
    req.session.userId = user.id;
    res.redirect('/dashboard');
  })(req, res, next);
};

exports.getConfig = (req, res) => {
  res.json({
    googleEnabled: !DEMO_MODE,
    googleClientId: DEMO_MODE ? null : GOOGLE_CLIENT_ID,
  });
};
