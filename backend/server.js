const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();

// Initialize DB on startup
require('./models/db');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'spendsense-pro-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
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

// Frontend routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SpendSense Pro running on http://localhost:${PORT}`));