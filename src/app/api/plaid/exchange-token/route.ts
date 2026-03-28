import { encrypt } from "@/lib/crypto";
import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. verify auth
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. get public token from request body
    const { public_token } = await request.json();

    // 3. exchange public token for access token
    const {
      data: { access_token, item_id },
    } = await plaidClient.itemPublicTokenExchange({ public_token });

    // 4. insert into items
    const { data: item, error: itemError } = await supabase
      .from("items")
      .insert({
        user_id: claims.sub,
        plaid_access_token: encrypt(access_token),
        plaid_item_id: item_id,
        status: "connected",
      })
      .select()
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: "Failed to store item" }, { status: 500 });
    }

    // 5. fetch account balances from Plaid
    const {
      data: { accounts },
    } = await plaidClient.accountsBalanceGet({ access_token });

    // build a map for O(1) lookups instead of repeated .find()
    const plaidAccountMap = new Map(accounts.map((a) => [a.account_id, a]));

    // 6. upsert accounts
    const upsertAccounts = accounts.map((account) => ({
      user_id: claims.sub,
      plaid_account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      subtype: account.subtype,
      type: account.type,
      mask: account.mask,
      iso_currency_code: account.balances.iso_currency_code,
      plaid_item_id: item.id,
    }));

    const { data: savedAccounts, error: upsertError } = await supabase
      .from("accounts")
      .upsert(upsertAccounts, { onConflict: "plaid_account_id" })
      .select();

    if (upsertError || !savedAccounts) {
      return NextResponse.json({ error: "Failed to store accounts" }, { status: 500 });
    }

    // 7. upsert balance snapshots (one per account per day)
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    const balanceSnapshots = savedAccounts.map((account) => ({
      account_id: account.id,
      balance: plaidAccountMap.get(account.plaid_account_id)?.balances.current,
      recorded_date: today,
      recorded_at: now,
    }));

    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert(balanceSnapshots, { onConflict: "account_id, recorded_date" });

    if (snapshotError) {
      return NextResponse.json({ error: "Failed to store snapshots" }, { status: 500 });
    }

    // 8. return accounts with current balances
    const returnData = savedAccounts.map((account) => ({
      ...account,
      balance: plaidAccountMap.get(account.plaid_account_id)?.balances.current ?? null,
      last_synced_at: now,
    }));

    return NextResponse.json({ accounts: returnData });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
