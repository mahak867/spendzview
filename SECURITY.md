# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, email the maintainer directly or open a
[GitHub private security advisory](https://github.com/mahak867/spendzview/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You can expect an initial response within **72 hours**.

## Security Best Practices for Deployment

- Set a strong, random `SESSION_SECRET` in your `.env` (never use the default).
- Run behind HTTPS in production — the session cookie is set to `secure: true`
  when `NODE_ENV=production`.
- Keep dependencies up to date: `npm audit` and `npm audit fix`.
- Restrict file-system write permissions on the `uploads/` and `database/` directories.
