const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Initialize DB on startup
require('./models/db');

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.tailwindcss.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'api.exchangerate-api.com'],
      frameSrc: ["'none'"],
    }
  }
}));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again later' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts, please try again later' } });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'spendsense-pro-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

// Initialize OAuth (passport)
const oauthCtrl = require('./controllers/oauthController');
oauthCtrl.initPassport(app);

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), version: require('../package.json').version }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/oauth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/shopping', require('./routes/shopping'));
app.use('/api/travel', require('./routes/travel'));
app.use('/api/health', require('./routes/health'));
app.use('/api/education', require('./routes/education'));
app.use('/api/insurance', require('./routes/insurance'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/banking', require('./routes/banking'));
app.use('/api/upi', require('./routes/upi'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/deepsearch', require('./routes/deepsearch'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/backup', require('./routes/backup'));
// New routes
app.use('/api/income', require('./routes/income'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/credit-cards', require('./routes/creditCards'));
app.use('/api/networth', require('./routes/networth'));
app.use('/api/tax', require('./routes/tax'));
app.use('/api/cashflow', require('./routes/cashflow'));
app.use('/api/search', require('./routes/search'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/split', require('./routes/split'));
app.use('/api/payments', require('./routes/razorpay'));
app.use('/api/privacy', require('./routes/privacy'));
app.use('/api/admin', require('./routes/admin'));

// Start cron jobs
require('./services/cronJobs');

// Frontend routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.get('/extension', (req, res) => res.sendFile(path.join(__dirname, '../frontend/extension.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, '../frontend/privacy.html')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SpendSense Pro running on http://localhost:${PORT}`));