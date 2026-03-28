import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. fetch all accounts for this user
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, plaid_account_id, name, type, subtype, mask, iso_currency_code")
      .eq("user_id", claims.sub);

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 });
    }
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // 2. fetch latest balance snapshot per account in one query
    const accountIds = accounts.map((a) => a.id);
    const { data: snapshots, error: snapshotError } = await supabase
      .from("balance_snapshots")
      .select("account_id, balance, recorded_at, recorded_date")
      .in("account_id", accountIds)
      .order("recorded_date", { ascending: false });

    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }

    // take the first (latest) snapshot per account
    const latestSnapshot = new Map<string, { balance: number; recorded_at: string }>();
    for (const snap of snapshots ?? []) {
      if (!latestSnapshot.has(snap.account_id)) {
        latestSnapshot.set(snap.account_id, {
          balance: snap.balance,
          recorded_at: snap.recorded_at,
        });
      }
    }

    // 3. merge accounts with their latest snapshot
    const result = accounts.map((account) => {
      const snap = latestSnapshot.get(account.id);
      return {
        ...account,
        balance: snap?.balance ?? null,
        last_synced_at: snap?.recorded_at ?? null,
      };
    });

    return NextResponse.json({ accounts: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
