# Contributing to Spendzview

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/mahak867/spendzview.git
cd spendzview
npm install
cp .env.example .env   # then edit .env with your settings
npm run dev
```

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear, focused commits.
3. Run `npm run lint` and fix any errors before pushing.
4. Open a pull request targeting `main`.

## Code Style

- ES2022 JavaScript on Node.js ≥ 22.
- ESLint is configured — run `npm run lint` before committing.
- Use `const`/`let`; avoid `var`.
- Use `===` for all comparisons.

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template.

## Requesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue template.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
