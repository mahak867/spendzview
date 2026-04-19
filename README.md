# Spendzview 💰

[![CI](https://github.com/mahak867/spendzview/actions/workflows/ci.yml/badge.svg)](https://github.com/mahak867/spendzview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

> Personal Finance, Banking & Life Management System

A full-stack web application for comprehensive personal finance management built with Node.js, Express, and SQLite.

## Features

- 🔐 **Authentication** — Secure registration, login, session management
- 💸 **Expense Tracking** — Add, edit, delete expenses with categories, tags, payment methods
- 🎯 **Budget Management** — Set monthly/category budgets with visual progress tracking
- 🧾 **Bills & Utilities** — Track electricity, water, internet, rent with due date alerts
- 🔄 **Subscriptions** — Manage Netflix, Spotify, gym memberships with renewal reminders
- 🛍️ **Shopping** — Purchase history, warranty tracking, return deadlines
- ✈️ **Travel** — Trip budgets, fuel tracking, mileage, flight/train/cab expenses
- 🏥 **Health** — Medical bills, doctor visits, medicine reminders
- 📚 **Education** — Tuition, courses, certifications tracking
- 🛡️ **Insurance** — Policy management, premium reminders, coverage summary
- 🏦 **Savings Goals** — Create goals with progress tracking and deposits
- 🏛️ **Banking** — Link accounts, import CSV bank statements, auto-categorize transactions
- 📱 **UPI Payments** — Generate UPI payment links, track payments
- 🔍 **DeepSearch AI** — Natural language financial queries
- 📊 **Analytics** — Charts for spending trends, category breakdown, budget progress
- 📈 **Reports** — Export CSV/PDF reports, JSON backup
- 🔔 **Notifications** — Bill reminders, budget alerts, renewal notifications

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS, Chart.js
- **Backend**: Node.js ≥ 22, Express.js
- **Database**: SQLite (built-in `node:sqlite` module — no native addon required)
- **Authentication**: express-session + bcrypt

## Requirements

- Node.js **≥ 22.0.0**
- npm **≥ 10.0.0**

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/mahak867/spendzview.git
cd spendzview

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET

# 4. Start the server
npm start

# Open in browser: http://localhost:3000
```

## Development

```bash
npm run dev    # Uses nodemon for auto-restart
npm run lint   # Run ESLint
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable         | Default                            | Description                                      |
|------------------|------------------------------------|--------------------------------------------------|
| `PORT`           | `3000`                             | Port the server listens on                       |
| `SESSION_SECRET` | *(fallback hardcoded — change it)* | Secret used to sign session cookies              |
| `NODE_ENV`       | —                                  | Set to `production` to enable secure cookies     |

> ⚠️ **Always set a strong `SESSION_SECRET` in production.** See [SECURITY.md](SECURITY.md).

## Project Structure

```
spendzview/
├── backend/
│   ├── controllers/    # Business logic for each domain
│   ├── routes/         # Express route definitions
│   ├── middleware/      # Auth + file upload middleware
│   ├── models/         # Database connection (node:sqlite)
│   ├── services/       # CSV parser, PDF export, insights
│   └── server.js       # Express app entry point
├── frontend/
│   ├── index.html      # Login/Register page
│   ├── dashboard.html  # Main SPA dashboard
│   └── styles.css      # Custom styles
├── database/
│   └── schema.sql      # SQLite schema (auto-applied on first run)
├── uploads/            # Uploaded files (git-ignored, kept via .gitkeep)
├── .env.example        # Environment variable template
└── package.json
```

## API Endpoints

| Domain        | Endpoints                                                       |
|---------------|-----------------------------------------------------------------|
| Auth          | POST `/api/auth/register`, `/login`, `/logout`, GET `/me`       |
| Expenses      | GET/POST `/api/expenses`, PUT/DELETE `/api/expenses/:id`        |
| Budgets       | GET/POST `/api/budgets`, GET `/api/budgets/status`              |
| Bills         | CRUD `/api/bills`, GET `/api/bills/upcoming`                    |
| Subscriptions | CRUD `/api/subscriptions`, GET `/api/subscriptions/summary`     |
| Banking       | CRUD `/api/banking`, POST `/import`, GET `/transactions`        |
| Analytics     | GET `/api/analytics/monthly`, `/categories`, `/daily`          |
| DeepSearch    | POST `/api/deepsearch/query`                                    |
| Backup        | GET `/api/backup/export/csv`, `/export/pdf`, `/export/json`     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and deployment best practices.

## License

[MIT](LICENSE)