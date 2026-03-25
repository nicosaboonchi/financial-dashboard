# Database Schema

## plaid_items

Stores one row per linked institution per user.

| column       | type        | notes                         |
| ------------ | ----------- | ----------------------------- |
| id           | uuid        | primary key                   |
| user_id      | uuid        | references auth.users         |
| access_token | text        | encrypted, server-side only   |
| item_id      | text        | Plaid's identifier            |
| status       | text        | 'active' or 'requires_reauth' |
| created_at   | timestamptz |                               |

RLS: disabled for client. All access via service role in API routes.

## snapshots

One row per account per sync. Used to build the net worth chart.

| column      | type        | notes                            |
| ----------- | ----------- | -------------------------------- |
| id          | uuid        | primary key                      |
| user_id     | uuid        | references auth.users            |
| account_id  | text        | Plaid account identifier         |
| name        | text        | e.g. "Chase Checking"            |
| type        | text        | depository / credit / investment |
| balance     | numeric     | current balance in dollars       |
| captured_at | timestamptz | when this snapshot was taken     |

RLS: users can only read their own rows.
