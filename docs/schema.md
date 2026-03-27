# Database Schema

## items

Stores one row per linked institution per user.

| column              | type        | notes                         |
| ------------------- | ----------- | ----------------------------- |
| id                  | uuid        | primary key                   |
| user_id             | uuid        | references auth.users         |
| plaid_access_token  | text        | encrypted, server-side only   |
| plaid_item_id       | text        | Plaid's identifier            |
| plaid_insitution_id | text        | the name of the institution   |
| status              | text        | 'active' or 'requires_reauth' |
| created_at          | timestamptz |                               |
| updated_at          | timestamptz |                               |

RLS: disabled for client. All access via service role in API routes.

## balance_snapshots

One row per account per sync. Used to build the net worth chart.

| column        | type        | notes                        |
| ------------- | ----------- | ---------------------------- |
| id            | uuid        | primary key                  |
| account_id    | text        | Plaid account identifier     |
| balance       | numeric     | current balance in dollars   |
| recorded_at   | timestamptz | when this snapshot was taken |
| recorded_date | date        |                              |

RLS: users can only read their own rows.

## accounts

| column            | type        | notes                  |
| ----------------- | ----------- | ---------------------- |
| id                | uuid        | primary key            |
| user_id           | uuid        | references users table |
| plaid_account_id  | text        |                        |
| name              | text        | name of the account    |
| subtype           | text        | type of account        |
| mask              | text        | 4 digit account number |
| iso_currency_code | text        | eg "USD"               |
| created_at        | timestamptz |                        |
| type              | text        | type of account        |
| updated_at        | timestamptz |                        |
