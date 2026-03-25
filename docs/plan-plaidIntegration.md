## Plan: Implement Plaid Integration

**TL;DR**: The plumbing is partially in place but has critical security violations — the `access_token` is being exposed to the client, which violates the core architecture constraint. This plan fixes the security issues, wires in Supabase auth, and completes the data pipeline from sandbox token → stored item → synced balances.

---

### Critical Issues to Fix

Before building anything new, these must be addressed:

- `exchange-token/route.ts` returns `access_token` to the client (**architecture violation**)
- `accounts/route.ts` accepts `access_token` from the client request body (**architecture violation**)
- `supabase/server.ts` uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — server routes must use `SUPABASE_SERVICE_ROLE_KEY`
- `plaid_items` table is never written to — access tokens are not persisted

---

### Phase 1: Supabase Auth & Secure Clients

**Step 1** — Install `@supabase/ssr` (enables cookie-based session reading in API routes and Server Components).

**Step 2** — Refactor `src/lib/supabase/server.ts` into two exported factory functions:

- `createServiceClient()` — uses `SUPABASE_SERVICE_ROLE_KEY` for all DB writes in Plaid routes
- `createServerClient()` — uses `@supabase/ssr` + Next.js cookies to read the authenticated user session

**Step 3** — Create `src/middleware.ts` using `@supabase/ssr`'s `createServerClient` to refresh session tokens on every request (standard Supabase SSR pattern).

**Step 4** — Create `src/app/api/auth/callback/route.ts` — Supabase's PKCE/OAuth redirect handler that exchanges the code for a session.

**Step 5** — Create `src/app/login/page.tsx` — minimal email sign-in form (magic link or password) using the Supabase client.

---

### Phase 2: Fix Plaid Security (_depends on Phase 1_)

**Step 6** — Fix `src/app/api/plaid/exchange-token/route.ts`:

- Read authenticated user from session
- After calling `itemPublicTokenExchange`, **insert into `plaid_items`**: `{ user_id, access_token, item_id, status: 'active' }`
- Return `{ item_id }` only — never return `access_token`

**Step 7** — Fix `src/app/api/plaid/accounts/route.ts`:

- Remove `access_token` from request body entirely
- Read authenticated user from session via `createServerClient()`
- Query `plaid_items` for the user's active access tokens
- Call `accountsBalanceGet` per item, upsert into `accounts` + `snapshots` (aligning to actual DB table names — see note below)
- Return accounts + snapshots

**Step 8** — Create `src/app/api/plaid/sync/route.ts` (POST):

- Same pattern as accounts route but decoupled as a dedicated sync endpoint for future cron use
- Returns updated balance data after writing snapshots

---

### Phase 3: UI Updates (_depends on Phase 2_)

**Step 9** — Update `src/app/page.tsx`:

- Remove `accessToken` state — client should never hold it
- Remove `<p>Access Token: {accessToken}</p>` display
- Add session check on mount; redirect to `/login` if unauthenticated
- Update connect flow: `sandbox-token` → `exchange-token` (receives `item_id`, not token) → call `sync` → display accounts

---

### Relevant Files

- `src/lib/supabase/server.ts` — refactor to two client factories
- `src/app/api/plaid/exchange-token/route.ts` — store token in DB, return item_id only
- `src/app/api/plaid/accounts/route.ts` — remove client-passed token, use DB lookup
- `src/app/page.tsx` — remove accessToken state, auth guard
- `src/middleware.ts` _(create)_ — Supabase SSR middleware
- `src/app/login/page.tsx` _(create)_ — login UI
- `src/app/api/auth/callback/route.ts` _(create)_ — auth callback
- `src/app/api/plaid/sync/route.ts` _(create)_ — dedicated sync endpoint

---

### Verification

1. `POST /api/plaid/exchange-token` returns `{ item_id }` — confirm no `access_token` in response
2. Supabase `plaid_items` table gains a row for the linked institution
3. `POST /api/plaid/accounts` (no token in body) returns accounts using DB-stored token
4. Unauthenticated requests to any Plaid route return `401`
5. Login → connect bank → accounts list renders with current balances

---

### Further Considerations

1. **Schema discrepancy**: The docs define `plaid_items` + `snapshots`, but the current code targets `accounts` + `balance_snapshots`. Since the tables already exist, the implementation will need to match whatever's actually in Supabase. Confirm: are the tables named `plaid_items`/`snapshots` (per docs) or `accounts`/`balance_snapshots` (per current code)?

2. **Access token encryption**: The docs mention access tokens should be stored following the Open Finance Security Data Standard (encrypted at rest). This plan stores them as plaintext in Supabase. Encryption at the application layer (e.g. AES-256 via a `ENCRYPTION_KEY` env var before insert) is a follow-up worth noting.
