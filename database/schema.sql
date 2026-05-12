CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  currency TEXT DEFAULT 'INR',
  monthly_income REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  tags TEXT,
  payment_method TEXT DEFAULT 'cash',
  date TEXT NOT NULL,
  is_recurring INTEGER DEFAULT 0,
  recurring_interval TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  total_budget REAL DEFAULT 0,
  category TEXT,
  category_budget REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  utility_type TEXT,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  is_paid INTEGER DEFAULT 0,
  paid_date TEXT,
  late_fee REAL DEFAULT 0,
  monthly_usage REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  billing_cycle TEXT DEFAULT 'monthly',
  next_renewal TEXT,
  category TEXT,
  is_active INTEGER DEFAULT 1,
  cancel_url TEXT,
  logo_url TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  amount REAL NOT NULL,
  store TEXT,
  category TEXT,
  purchase_date TEXT NOT NULL,
  warranty_expiry TEXT,
  return_deadline TEXT,
  return_status TEXT DEFAULT 'pending',
  receipt_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS travel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trip_name TEXT,
  trip_id TEXT,
  type TEXT NOT NULL,
  transport_mode TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  origin TEXT,
  destination TEXT,
  distance_km REAL,
  fuel_cost REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  provider TEXT,
  reminder_date TEXT,
  insurance_claim REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  institution TEXT,
  renewal_date TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS insurance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  policy_number TEXT,
  premium REAL NOT NULL,
  coverage_amount REAL,
  start_date TEXT,
  end_date TEXT,
  next_premium_date TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  saved_amount REAL DEFAULT 0,
  monthly_target REAL DEFAULT 0,
  target_date TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT,
  balance REAL DEFAULT 0,
  ifsc_code TEXT,
  branch TEXT,
  last_synced DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bank_account_id INTEGER,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  category TEXT,
  date TEXT NOT NULL,
  reference_number TEXT,
  balance_after REAL,
  is_duplicate INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
);

CREATE TABLE IF NOT EXISTS upi_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  upi_id TEXT NOT NULL,
  payee_name TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'pending',
  transaction_ref TEXT,
  upi_link TEXT,
  qr_data TEXT,
  notes TEXT,
  date TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  file_path TEXT NOT NULL,
  related_to TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS setu_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  consent_id TEXT,
  consent_handle TEXT,
  phone_number TEXT,
  status TEXT DEFAULT 'pending',
  consent_url TEXT,
  redirect_url TEXT,
  requested_at DATETIME,
  approved_at DATETIME,
  last_synced_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bank_account_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bank_account_id INTEGER NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  consent_id INTEGER,
  masked_account_number TEXT,
  status TEXT DEFAULT 'linked',
  live_balance REAL DEFAULT 0,
  live_balance_at DATETIME,
  raw_payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (consent_id) REFERENCES setu_consents(id)
);

CREATE TABLE IF NOT EXISTS bank_raw_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  transaction_id INTEGER,
  bank_account_id INTEGER,
  consent_id INTEGER,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT,
  reference_number TEXT,
  merchant_name TEXT,
  merchant_vpa TEXT,
  upi_ref_no TEXT,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  date TEXT NOT NULL,
  balance_after REAL,
  raw_payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (consent_id) REFERENCES setu_consents(id)
);

CREATE INDEX IF NOT EXISTS idx_setu_consents_user ON setu_consents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_account_links_user ON bank_account_links(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_bank_raw_transactions_user_date ON bank_raw_transactions(user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_raw_transactions_provider_txn ON bank_raw_transactions(user_id, provider, provider_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_upi_transaction_ref_unique ON upi_payments(user_id, transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref != '';
