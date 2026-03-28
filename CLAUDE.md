@AGENTS.md

# Financial Dashboard — Codebase Guide

A net worth tracker that connects to financial institutions via Plaid, stores historical balance snapshots, and displays a net worth area chart over time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend/Backend | Next.js 16.2.1 (App Router), React 19 |
| Styling | TailwindCSS 4, shadcn/ui (radix-nova style), Radix UI |
| Database / Auth | Supabase (PostgreSQL + Auth + RLS) |
| Financial Data | Plaid API |
| Charts | Recharts |
| Icons | Lucide React |
| Hosting | Vercel |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── plaid/
│   │   │   ├── sandbox-token/route.ts   # GET: creates sandbox public token
│   │   │   ├── exchange-token/route.ts  # POST: exchanges token, stores in DB
│   │   │   ├── sync/route.ts            # GET: syncs balances from Plaid
│   │   │   └── transactions/route.ts   # POST: fetches transaction sync data
│   │   └── supabase/
│   │       └── accounts/route.ts        # GET: retrieves user accounts + history
│   ├── auth/
│   │   └── confirm/route.ts             # Email OTP confirmation handler
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── page.tsx                         # Home: account connection + balance display
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                              # shadcn/ui components (Button, Card, etc.)
│   ├── login-form.tsx
│   ├── sign-up-form.tsx
│   └── theme-provider.tsx
└── lib/
    ├── plaid/plaid.ts                   # Plaid API client (sandbox)
    ├── supabase/
    │   ├── server.ts                    # Server-side Supabase client
    │   ├── client.ts                    # Browser-side Supabase client
    │   └── proxy.ts                     # Middleware session management
    └── utils.ts                         # cn(), fmtCurrency()
```

Key non-source files:
- `docs/architecture.md` — system overview and data flow
- `docs/schema.md` — full database schema reference
- `docs/plaid-integration.md` — Plaid integration guide

---

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Environment Variables

Copy `.env.example` and fill in values:

```
PLAID_CLIENT_ID=
PLAID_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
PLAID_ENV=sandbox
```

A Supabase service role key is also required server-side for bypassing RLS in API routes (see `docs/plaid-integration.md`).

---

## Architecture & Key Conventions

### Security — Non-Negotiable Rules

- **Plaid access tokens NEVER leave the server.** They are stored encrypted in Supabase and only accessed in API routes using the service role key.
- All Plaid API calls must happen inside `src/app/api/` routes, never in client components.
- Supabase service role key is server-only — never expose it to the client.

### Next.js App Router Patterns

- **Before writing any Next.js code**, read the relevant guide in `node_modules/next/dist/docs/` — this project uses Next.js 16 which has breaking changes from earlier versions.
- Server Components are the default. Add `"use client"` only when needed (event handlers, `useState`, `useEffect`).
- API routes use the `route.ts` convention with named exports (`GET`, `POST`, etc.).
- Middleware lives in `src/proxy.ts` (root of `src/`) and calls `updateSession()` from `src/lib/supabase/proxy.ts` on every request.
- Do NOT call `supabase.auth.getUser()` — this project uses `supabase.auth.getClaims()` per the Supabase SSR pattern used here.

### Supabase Client Usage

| Context | Import |
|---|---|
| Server Components / API Routes | `src/lib/supabase/server.ts` |
| Client Components | `src/lib/supabase/client.ts` |
| Middleware | `src/lib/supabase/proxy.ts` → `updateSession()` |

Always create a new Supabase server client per request — do not store it in a module-level variable (required for Fluid compute compatibility).

### Authentication Flow

1. User signs up → Supabase sends confirmation email
2. User clicks link → `/auth/confirm` verifies OTP, redirects to `/`
3. Login → email/password via Supabase, session stored in cookies
4. Middleware validates session on every request via `getClaims()`
5. Unauthenticated users are redirected to `/login` (except `/auth/*` routes)
6. Authenticated users visiting `/login` or `/signup` are redirected to `/`

### Plaid Integration Flow (Sandbox)

1. Client calls `GET /api/plaid/sandbox-token` → receives `public_token`
2. Client calls `POST /api/plaid/exchange-token` with `public_token`
3. Server exchanges for access token, stores in `items` table, fetches balances, upserts into `accounts` and `balance_snapshots`
4. Daily cron (Vercel) calls `GET /api/plaid/sync` to refresh all snapshots

---

## Database Schema

### `items`
One row per linked institution per user.

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | references auth.users |
| plaid_access_token | text | encrypted, server-side only |
| plaid_item_id | text | Plaid's identifier |
| plaid_institution_id | text | institution identifier |
| status | text | `'active'` or `'requires_reauth'` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: **disabled** — all access via service role in API routes.

### `accounts`
One row per bank account per user.

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | references auth.users |
| plaid_account_id | text | Plaid's identifier |
| plaid_item_id | text | links to items table |
| name | text | account display name |
| type | text | e.g. `depository` |
| subtype | text | e.g. `checking`, `savings` |
| mask | text | last 4 digits |
| iso_currency_code | text | e.g. `USD` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `balance_snapshots`
One row per account per day. Drives the net worth chart.

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| account_id | text | Plaid account identifier |
| balance | numeric | current balance in dollars |
| recorded_date | date | one snapshot per account per day |
| recorded_at | timestamptz | exact timestamp |

Upsert on conflict `(account_id, recorded_date)` — most recent reading wins. RLS: users can only read their own rows.

---

## UI Conventions

- Use components from `src/components/ui/` (shadcn/radix-nova). Add new shadcn components via `npx shadcn add <component>`.
- Styling: TailwindCSS 4 utility classes. Use `cn()` from `src/lib/utils.ts` to merge class names.
- Currency formatting: use `fmtCurrency(amount, isoCode)` from `src/lib/utils.ts`.
- Dark/light theme: wrap with `ThemeProvider` (already in `layout.tsx`).
- Path alias `@/*` resolves to `src/*`.

---

## Testing

There is no automated test suite. Testing relies on:
- Plaid sandbox environment (`PLAID_ENV=sandbox`, institution `ins_109508`)
- Manual testing via the dev server
- The "Connect your bank account" button on the home page triggers the full sandbox flow end-to-end
