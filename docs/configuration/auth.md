# Auth

ClipEngine uses [Better Auth](https://www.better-auth.com/) for
sessions and passwords. The whole story fits on this page.

## Single admin

The first visit creates the only admin. After that, registration is
closed and `/register` redirects to `/login`.

The `users.role` column is already there for the multi-user upgrade
path later, but the v1 product is single-tenant.

## Username, not email

Better Auth requires an email column. ClipEngine never asks for one —
we synthesize `<username>@clipengine.local` to satisfy the schema and
expose only the username in the UI. The
[username plugin](https://www.better-auth.com/docs/plugins/username)
handles `/sign-in/username` and the `username` validation.

## Passwords

- bcrypt (handled by Better Auth).
- Minimum 8 characters at the form level; Better Auth enforces its
  own minimum at the API level.
- Forgotten password recovery is **not** in v1. Lose the password,
  reset the SQLite `user` row by hand or `docker volume rm
  clipengine_data` and start over.

## Sessions

- HTTP-only cookies, prefixed `clipengine_…`.
- Secure flag flips on automatically when `NODE_ENV=production`.
- TTL: Better Auth's default (currently 7 days; rolling).
- Server-side session storage in the `session` table.

## Signing key

`CLIPENGINE_AUTH_SECRET` is the cookie signing secret. Required in
production; generate with `openssl rand -hex 32`. Don't lose it
across restarts — every active session dies if the secret changes.

## Routes

Better Auth handles these under `/api/auth/*`:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/username`
- `POST /api/auth/sign-out`
- `GET  /api/auth/get-session`

The web app calls them through the `/api-engine/api/auth/...` proxy.

## Reverse proxy headers

The proxy must forward `Host` and `X-Forwarded-Proto`. Better Auth
uses them to set the secure-cookie flag and the right cookie domain.
See [self-host/reverse-proxy.md](../self-host/reverse-proxy.md).

## Rate limiting

Better Auth has a built-in limiter; we leave the defaults. If you
expose the api directly to the public internet, put a real limiter
in front (Cloudflare, nginx `limit_req`, Caddy `rate_limit`).

## Future

Once multi-user is on, the same Better Auth instance gains:

- Self-service signup (gated by an admin flag).
- Roles + ACL — already structured in the `user` table.
- Optional 2FA via Better Auth's TOTP plugin.

None of those are in v1.
