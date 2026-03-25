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
7. Store the `access_token` following Open Finance Security Data Standard.

## Alternative Link Flows

### Link update mode

Allows you to update an access_token that has stopped working.

### Sandbox testing env

Offers the `/sandbox/public_token/create` endpoint which allows to create a `public_token` without using Link

## Fetching Balances

1. Cron job triggers `api/plaid/sync`
2. API route queries `plaid_items` for all active `access_tokens`
3. For each token, calls `/accounts/balance/get`
4. The balances are then written to snapshots in Supabase

## Manaul Refresh

1. User clicks refresh now on client
2. Check when last request was made
3. API route queries `plaid_items` for all active `access_tokens`
4. For each token, calls `/accounts/balance/get`
5. Balances and timestamps are then updated in Supabase
