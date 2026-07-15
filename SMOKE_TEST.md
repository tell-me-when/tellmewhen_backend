# Manual smoke test

Run this end-to-end flow after every refactor phase before moving on.
Two browser sessions (or one incognito) — one as a worker, one as the customer.

## 1. Auth
- [ ] Register a new business via the wizard (see "Registration wizard" section below for the detailed pass)
- [ ] Log in with the admin account — `access`/`refresh` cookies set, dashboard loads
- [ ] Log out (`/clearCookies`) — cookies cleared, protected routes now `401`
- [ ] Let the access token expire (or force it) — `/refresh` issues a new one and the session continues

## Registration wizard

Backend endpoints verified directly via curl during implementation (register,
check-subdomain, name/subdomain conflicts, ToS rejection, empty optional
fields) — this section is what still needs a real browser pass, which
wasn't available during implementation.

- [ ] **Migration re-run safety**: `npm run migrate` twice against a fresh dev DB
      — second run completes without error; `DESCRIBE BUSINESS_TABLE;` shows
      `Subdomain`/`Address`/`Location_Link`/`Phone`/`Email`/`Opening_Hours`/
      `ToS_Accepted`/`ToS_Accepted_At` and both `UQ_Business_Subdomain`/
      `UQ_Business_Name` unique indexes exactly once.
- [ ] **Step 1 (Business Name)**: typing a name auto-fills a slugified subdomain;
      manually editing the subdomain stops further auto-overwriting; typing `api`
      shows "reserved" within ~400ms and blocks Next; an already-registered
      subdomain shows "taken"; a free one shows "available"; Back/Next preserves
      both fields.
- [ ] **Step 2 (Business Info)**: "Skip for now" with everything blank proceeds;
      partial fill proceeds; Back from step 3 returns with step-2 values intact.
- [ ] **Step 3 (Password)**: mismatched or under-8-char passwords block Next with
      inline messages; Back/Next preserves values.
- [ ] **Step 4 (Terms of Service)**: "Create Business" disabled until the checkbox
      is checked; placeholder ToS content renders (real copy is still pending —
      see the `TODO` in `StepTermsOfService.jsx`).
- [ ] **End-to-end success**: full flow → business created → auto-login →
      `/dashboard` loads. Then `SELECT * FROM BUSINESS_TABLE WHERE Subdomain = '...'`
      — confirm every field persisted, `ToS_Accepted = 1`, `ToS_Accepted_At`
      populated with a plausible server timestamp.
- [ ] **Name collision**: register the same business name twice (different
      subdomain) — second attempt shows an inline error on step 1's business-name
      field, no orphaned rows in `BUSINESS_TABLE`/`WORKER_TABLE`.
- [ ] **Subdomain collision**: two browser tabs both reach "available" on the same
      subdomain; submit tab A (succeeds), then tab B — must show the "taken" error
      on step 1's subdomain field, not a generic failure, and leave no partial rows
      behind.

## 2. Jobs
- [ ] Create a new job as admin — QR code renders
- [ ] Scan / open the QR link as the customer — job details load at `/customer_view/[slug]`
- [ ] Assign the job to a worker (moderator+) — appears in that worker's current jobs
- [ ] Worker marks the job complete — moves from current jobs to history for that business only

## 3. Notifications
- [ ] Customer subscribes to push on the job page
- [ ] Worker sends a notification — customer receives it
- [ ] Complete the job — the subscription row is cleaned up

## 4. Chat
- [ ] Worker opens the job chat — channel created, welcome message visible
- [ ] Customer (guest) opens the same job's chat link — joins the same channel
- [ ] Complete the job — channel is torn down

## 5. Account management (admin only)
- [ ] Add a new employee — can log in with the assigned role
- [ ] Change another employee's password
- [ ] Change business name / photo
- [ ] Delete an employee — their open jobs reassign to an admin, not deleted
- [ ] Delete the business — all related rows (jobs, history, subscriptions, tokens, workers) are gone

## 6. Cross-tenant checks (should all fail)
- [ ] Business A admin cannot view/complete/assign a Business B job by ID
- [ ] Business A admin cannot change a Business B user's password or delete them
- [ ] A worker cannot mark another worker's job complete

Any step that changes behavior between phases (e.g. cookies becoming `httpOnly`) needs
its corresponding frontend flow re-checked in the browser, not just the API response.

## Note: job-ID encryption is not backward compatible

Job IDs are AES-256-GCM encrypted with a per-message random IV. Any QR code or
customer link generated before `ENCRYPTION_KEY` was rotated to a 32-byte key
(see README) will not decrypt — regenerate the job or re-print the QR code
rather than expecting old links to keep working after a key rotation.
