const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../database/spendsense.db');
const schemaPath = path.join(__dirname, '../../database/schema.sql');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Run schema (CREATE TABLE IF NOT EXISTS is safe to re-run)
// Split on semicolons and skip ALTER TABLE (handled below)
const schema = fs.readFileSync(schemaPath, 'utf8');
const stmts = schema.split(';').map(s => s.trim()).filter(s => s && !s.toUpperCase().startsWith('ALTER'));
for (const stmt of stmts) {
  try { db.exec(stmt + ';'); } catch (e) { /* ignore */ }
}

// Run column migrations safely
const migrations = [
  `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`,
  `ALTER TABLE users ADD COLUMN plan_expires_at DATETIME`,
  `ALTER TABLE users ADD COLUMN google_id TEXT`,
  `ALTER TABLE users ADD COLUMN avatar_url TEXT`,
  `ALTER TABLE users ADD COLUMN onboarding_done INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN two_factor_secret TEXT`,
  `ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0`,
  `ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'INR'`,
  `ALTER TABLE expenses ADD COLUMN converted_amount REAL`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

console.log('Database initialized successfully');

module.exports = db;
