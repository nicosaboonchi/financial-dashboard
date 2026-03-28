# Plaid Integration

## Key Concepts

### Item

A plaid item is a single connection to a financial institution and a user. One user can have many Items (Chase, Capital One, Robinhood). Each Item can expose multiple accounts (e.g. checking + savings + CDs)

### Public Token vs Access Token

- **Public Token:** is short-lived, and returned by Plaid link on the client when a user links to their financial institution. It is safe to send to the server since it expires quickly.
- **Access Token:** is a long-lived, server-side token that is used to call the Plaid API. This should never be exposed to the client.

## Linking Flow

1. Obtain a `link_token` by calling `/link/token/create`
2. Initialize Link by passing in the `link_token`
3. User authenticates with OAuth to thier bank
4. Plaid the returns a `public_token` to the client via onSuccess callback
5. Client POSTs `public_token` to `api/plaid/exchange`
6. The API route then calls Plaids route `/item/public_token/exchange` -> we are then returned an `access_token`
7. Store the `access_token` and `item_id` into the `items` table following Open Finance Security Data Standard.

## Alternative Link Flows

### Link update mode

Allows you to update an access_token that has stopped working.

### Sandbox testing env

1. client gets public token for an item by calling `POST /api/plaid/sandbox-token`
2. exchange the public token for an access token by calling `POST /api/plaid/exchange-token`
3. store the access token and item in supabase
4. call `api/plaid/sync` to fetch the balance data

## Sync and Refresh

### How it works

Balances can be synced in 2 ways:

- **Scheduled:** Vercel cron will automatically run once a day, attempting to fetch the most current balances
- **Manual:** Users can trigger a manual refresh by clicking a button on the app for live data (limited to once per hour)

Both paths will trigger the `api/plaid/sync` route

### Snapshot Upsert Strategy

Snapshots will be updated rather than inserted on every sync, if a balance has already been updated for the current day we will update the balance and the recorded date and time, rather than creating a new record.

conflict target: `(account_id, date)`

On conflict:

- Update `balance`
- Update `updated_at`

This means each account has at most one snapshot per day — the most
recent balance reading for that day wins.

### Why Upsert over Insert

- We prevent duplicate rows with the same balance, balances rarely change on an hour to hour basis
- Our chart focuses on long term growth, we dont care about hour by hour changes only day to day
- Keeps the queries simple and less costly since we only need to get the rows for each day
- Daily and manual refresh stay idompotent, meaning the same operation returns the same outcome
