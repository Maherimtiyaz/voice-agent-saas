# Security and deployment hardening

This document covers the deployment-side controls that cannot live entirely
in application code: database TLS and roles, backups, admin access, preview
deployments, and the operational checklist before selling or promoting a
production deployment.

The application layer (tenant isolation, authentication, token hashing,
webhook verification) is described in `README.md`. Nothing here replaces a
real penetration test, but every item below is either implemented in the
repository or is a one-time provider setting.

## Response headers

`next.config.ts` sets a baseline CSP plus the standard hardening headers on
every response:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; scripts/styles allow `'unsafe-inline'` because Next.js and the pre-paint theme script are inline |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (production only) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin`; `no-referrer` on `/api/admin/*` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, and USB disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`X-Powered-By` is disabled. `/api/*` is also sent `X-Robots-Tag: noindex` and
`Cache-Control: no-store`.

The CSP is intentionally a baseline, not a nonce policy. A nonce requires
every page to be dynamically rendered, which would remove static rendering
from the marketing site. Tighten it with nonces once that trade-off is
acceptable, and add a `Content-Security-Policy-Report-Only` report endpoint
before switching a stricter policy to enforcing.

## Database

### TLS

`db/index.ts` requires TLS by default for every non-local host, even when the
connection string omits `sslmode`. In production the process refuses to start
if `DATABASE_SSL=disable` is combined with a remote host.

- Use `sslmode=require` (the default) on the provider's pooled URL.
- Use `DATABASE_SSL=verify-full` when the provider's CA is in the system trust
  store and certificate/hostname validation is required.
- `DATABASE_SSL=disable` is only for localhost or a trusted private network,
  and is rejected in production for remote hosts.

### Pooling

Every serverless instance gets its own `postgres.js` client, so the app
defaults to `max: 3` for remote hosts (`DATABASE_POOL_MAX` overrides it,
1–100) and expects the provider's pooler to do the real multiplexing.

- Use the provider's **pooled** connection string (Neon "Pooled connection",
  Supabase pooler on port 6543, RDS Proxy, PgBouncer).
- If the pooler runs in **transaction mode**, set `DATABASE_PREPARE=false`:
  prepared statements are not safe across pooled transactions.

### Least-privilege runtime role

Do not run the app as the database owner. Create two roles:

1. **Migration role** (owner or a role with DDL rights): used only by
   `npm run db:migrate` during a release, from a trusted environment.
2. **Runtime role**: used by `DATABASE_URL` in the application.

The runtime role needs, at minimum:

```sql
-- Connect and use the schema
GRANT CONNECT ON DATABASE your_database TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;

-- DML on the application tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- Apply the same grants to tables created later by the migration role
ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
```

It must **not** have `CREATEDB`, `CREATEROLE`, `SUPERUSER`, or ownership of
the schema. Revoke `CREATE` on `public` from the runtime role if the provider
grants it by default.

### Backups and recovery

Enable these in the provider console; they are not code:

- Automated daily backups with at least 7 days of retention (30 days for
  customer data).
- Point-in-time recovery (PITR) if the provider offers it. The campaign
  scheduler, email outbox, and webhook deduplication are all database state,
  so a restore also restores in-flight work.
- A restore test into a separate database before launch and after any
  provider migration.
- Encrypted storage at rest (default on managed providers) and restricted
  network access (IP allowlist / private networking where available).

## Sessions and passwords

- Passwords are bcrypt cost 12 and are capped at 72 bytes, the limit bcrypt
  actually reads. Longer input is rejected instead of silently truncated.
- Session JWTs carry `users.session_version`. `getCurrentUser` compares the
  claim with the row on every request, so advancing the column invalidates
  every existing token.
- "Sign out everywhere" (Settings → Security) and a password reset both bump
  the version. A reset also burns the reset token.
- Password reset tokens are 256-bit, stored only as SHA-256 hashes, expire
  after one hour, are single-use, and are rate-limited per email and per IP.
  The response is identical whether or not the address exists.
- Password reset requires an email provider (`EMAIL_API_KEY` and
  `EMAIL_FROM`). Without one, the request returns the same generic message
  and simply cannot deliver a link.
- Email verification is **not implemented**. It is tracked as a product
  follow-up; it does not block the current reset/revocation model.

## Platform admin inbox

`/api/admin/demo-requests` is protected by HTTP Basic auth because the leads
are global, not workspace-scoped. In addition to the credentials:

- The inbox is disabled (404) unless `ADMIN_USERNAME` is set and
  `ADMIN_PASSWORD` is at least 24 characters.
- `ADMIN_ALLOWED_IPS` optionally restricts access to a comma-separated list
  of exact IPs or IPv4 CIDR ranges. Requests outside the list get a 404
  before credentials are checked.
- Failed credential attempts are limited to 10 per 15 minutes per IP;
  successful requests do not consume the budget.
- Every decision (granted, unauthorized, rate-limited, IP denied) is written
  as a structured JSON log line with the resolved IP and timestamp. No lead
  data or credentials are logged.

Generate the password with `openssl rand -base64 32`. Do not reuse a
workspace password, and rotate it if it has ever been pasted into a chat,
ticket, or shell history.

## Vercel and preview deployments

- Store secrets as **Production-only** environment variables. If preview
  deployments inherit production secrets, anyone with a preview URL can hit
  the production database and providers.
- Enable Vercel Deployment Protection for preview deployments (password or
  Vercel Authentication).
- Use a separate preview database and separate provider credentials
  (Twilio/Vapi/OpenAI/Resend) where possible.
- `vercel.json` schedules two one-minute crons. Vercel sends
  `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET`,
  `CAMPAIGN_CRON_SECRET`, and `EMAIL_CRON_SECRET` to the same value, or use an
  external scheduler against the `POST` endpoints.
- Per-minute crons require a paid plan. On Hobby, use an external scheduler.
- `.vercelignore` prevents local env backups, logs, build output, and test
  artifacts from being uploaded by a manual `vercel deploy`.

## Repository and CI

- `package-lock.json` is committed; Vercel and CI install with `npm ci`, so
  dependency resolution is reproducible.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm audit --omit=dev
  --audit-level=high`, lint, typecheck, and tests on every push and pull
  request. A failing production-dependency audit blocks the build.
- `.env.example` is committed and `.env*` is ignored except for that file.
  Local backups and verification logs were removed and are covered by
  `.vercelignore`.
- Node is pinned to `>=22` in `package.json`; set the same major version in
  the host so security patches keep arriving.

## Pre-launch checklist

1. `npm audit --omit=dev` is clean at `high` (CI enforces this).
2. `DATABASE_URL` uses the pooled endpoint with TLS; the runtime role is not
   the owner.
3. Backups and PITR are enabled, and a restore has been tested.
4. `SESSION_SECRET` is at least 32 random characters and unique per
   environment.
5. `ADMIN_PASSWORD` is at least 24 random characters; `ADMIN_ALLOWED_IPS` is
   set if the team has stable egress addresses.
6. Preview deployments cannot reach production secrets or the production
   database.
7. Cron secrets are set and the two internal endpoints return 401 without a
   token.
8. Provider webhooks (Twilio, Vapi) are configured for the final HTTPS
   domain.
9. The team knows how to use "Sign out everywhere" and the password reset
   flow during an incident.
10. A data-retention and deletion policy exists for leads, calls,
    transcripts, and recordings (GDPR/CCPA), including the subprocessors used
    (Twilio, Vapi, OpenAI, the email provider, the database host).
