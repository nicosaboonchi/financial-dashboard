# Architecture

## Overview

A net worth tracker that connects to financial institutions via Plaid, stores historical balance snapshots, and displays a networth area chart over time.

## Stack

- **Frontend/Backend:** NextJs (App Router) + Tailwindcss + Shadcn
- **Database:** Supabase (postgres + auth + RLS)
- **Financial Data:** Plaid API
- **Hosting:** Vercel

## Dataflow

1. User links to a financial institution via Plaid Link (client)
2. Public token is returned from link and exhanged for access token (server)
3. Access token is encrypted and stored in Supabase
4. Daily cron job fetches balances from Plaid and writes snapshots to Supabase
5. Client reads from snapshots table to render the networth chart

## Contraints

- Access token **NEVER** leaves the server
- Client only ever reads from the Supbase tables
- All Plaid API calls happen in API routes using the service role key
