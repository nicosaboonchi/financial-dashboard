import { plaidClient } from "@/lib/plaid/plaid";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. fetch all items for this user
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("id, plaid_access_token")
      .eq("user_id", claims.sub);

    if (itemsError) {
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ success: true, synced: 0 });
    }

    // 2. fetch balances from Plaid for all items in parallel
    const plaidResults = await Promise.all(
      items.map((item) =>
        plaidClient.accountsBalanceGet({ access_token: item.plaid_access_token })
      )
    );

    const allPlaidAccounts = plaidResults.flatMap((r) => r.data.accounts);

    // 3. look up internal account IDs for mapping
    const { data: dbAccounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, plaid_account_id")
      .eq("user_id", claims.sub);

    if (accountsError || !dbAccounts) {
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }

    const accountIdMap = new Map<string, string>(
      dbAccounts.map((a) => [a.plaid_account_id, a.id])
    );

    // 4. build and upsert balance snapshots
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    const balanceSnapshots = allPlaidAccounts
      .filter((a) => accountIdMap.has(a.account_id))
      .map((a) => ({
        account_id: accountIdMap.get(a.account_id)!,
        balance: a.balances.current,
        recorded_date: today,
        recorded_at: now,
      }));

    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert(balanceSnapshots, { onConflict: "account_id, recorded_date" });

    if (snapshotError) {
      return NextResponse.json({ error: "Failed to save snapshots" }, { status: 500 });
    }

    return NextResponse.json({ success: true, synced: balanceSnapshots.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
