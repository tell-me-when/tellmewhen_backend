# TellMeWhen — backend

Express API for TellMeWhen: businesses create jobs, generate QR codes for
customers, send web-push notifications, and run Stream-based chat between
workers and customers.

## Stack

- Express 4 + MySQL (via `mysql2`)
- Auth: RS256 JWT (via `jose`) in `httpOnly` cookies, with server-side
  revocation tracked in the `TOKENS` table
- Job IDs are AES-256-GCM encrypted when they leave the server (QR codes,
  customer links) and decrypted once at the route boundary
- Request validation: `zod`
- Chat: Stream Chat · Push: `web-push` (VAPID)

## Prerequisites

- Node `20.x` recommended (see `engines` in `package.json` — a patched
  transitive dependency, `buffer-equal-constant-time`, otherwise crashes on
  newer Node versions that removed the `SlowBuffer` global; the patch in
  `patches/` fixes this automatically via `postinstall`, so newer Node
  should work too, but 20.x is what's actually been verified)
- A MySQL 8.x server, reachable from wherever you run the app

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_DATABASE` — your MySQL connection
- `ENCRYPTION_KEY` — `openssl rand -base64 32`
- `VAPID_PUBLIC` / `VAPID_PRIVATE` — `npx web-push generate-vapid-keys`
- `STREAM_API_KEY` / `STREAM_API_SECRET` — from your Stream Chat dashboard
- `PORT`, `NODE_ENV` — as needed

You'll also need four RSA keypairs on disk (not env vars, read directly by
the app): `jwtRSA256-private.pem` / `jwtRSA256-public.pem` (access tokens)
and `refresh-private.pem` / `refresh-public.pem` (refresh tokens). Generate
PKCS8/SPKI pairs, e.g.:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwtRSA256-private.pem
openssl rsa -pubout -in jwtRSA256-private.pem -out jwtRSA256-public.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out refresh-private.pem
openssl rsa -pubout -in refresh-private.pem -out refresh-public.pem
```

Boot fails fast with a clear error (`config/env.js`) if any required
variable is missing or malformed — check the message before digging further.

### Local database

Point `DB_HOST` etc. at any MySQL 8.x instance. If you don't already have
one running locally, Docker is the fastest, most reliable path — avoids
fighting Homebrew's mysql formula (see **Known gotchas** below):

```bash
docker run -d \
  --name tellmewhen-mysql \
  -e MYSQL_ROOT_PASSWORD=<root-password> \
  -e MYSQL_DATABASE=tellmewhen \
  -e MYSQL_USER=tellmewhen \
  -e MYSQL_PASSWORD=<app-password> \
  -p 3306:3306 \
  mysql:8.0
```

Then point `.env`'s `DB_*` vars at `127.0.0.1:3306` / `tellmewhen` /
`tellmewhen` / `<app-password>`.

### Create the schema

```bash
npm run migrate
```

Safe to re-run — every statement is `CREATE TABLE IF NOT EXISTS`.

### Run it

```bash
npm run startDev   # nodemon, auto-restarts on change
npm start           # plain node
```

## Project structure

```
routes/            Express routers — one file per resource area
repositories/       All SQL lives here, one file per entity
                     (business, worker, job, subscription, token)
middleware/         asyncHandler, validate (zod), decodeJobId, auth
schemas/            zod request schemas, mirroring routes/
constants/          Shared constants (role levels)
migrations/          Schema DDL + the runner script
config/env.js       Fail-fast environment validation, loaded first
db/pool.js          The one mysql2 connection pool + query/transaction helpers
patches/            patch-package fixes for broken transitive deps
```

Every route handler is wrapped in `asyncHandler` (`middleware/asyncHandler.js`).
This is Express 4, which does **not** auto-catch rejected promises from
async handlers — an unguarded `await` that throws will crash the whole
process, not just that request, unless it's wrapped. Any new route handler
must go through `asyncHandler` too.

## Security notes for future changes

- **Identity is server-derived, never client-supplied.** `userId`/`businessId`
  come from the verified JWT (`req.user`), never from the request body.
- **Every query that touches a job/worker/subscription is scoped to
  `businessId`.** Cross-tenant access should fail closed (404/403), not
  silently succeed on the wrong business's data.
- **Job IDs are decrypted once, at the route boundary**, via
  `decodeJobIdParam`/`decodeJobIdBody` (`middleware/jobId.js`). Handlers
  should never see the raw encrypted value.
- **Errors returned to clients are generic**; full detail goes to
  `console.error` server-side only (see the error handler in `app.js`).
  Don't reintroduce `res.json({ error: err })`-style raw error leaks.
- Regenerating `ENCRYPTION_KEY` invalidates every QR code / customer link
  already issued — they use per-message random IVs now (AES-256-GCM), so
  there's no way to decrypt old links with a new key. Rotate deliberately.

## Known gotchas

**Homebrew's `mysql` competes with Docker for port 3306, silently.**
If you have Homebrew's MySQL installed, its `launchd` job can keep
respawning `mysqld` on `127.0.0.1:3306` even after `brew services stop`
reports it as stopped — `brew services` and the actual `launchd` state can
disagree. A respawned instance will grab the port before or alongside a
Docker container's port mapping, causing connection attempts to silently
hit the wrong (and likely differently-configured) MySQL server —
symptoms look exactly like a credentials problem, not a routing one.

Check for this with `lsof -nP -iTCP:3306`. If you see a `mysqld` process
bound specifically to `127.0.0.1:3306` (not just Docker's proxy), fully
unload the job — killing the PID alone isn't enough, `launchd` will
restart it:

```bash
launchctl bootout gui/$(id -u)/homebrew.mxcl.mysql
```

## Testing changes

There's no automated test suite yet. Run through `SMOKE_TEST.md` manually
after any change touching auth, tenant scoping, or job lifecycle.
