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
      .select("id, type")
      .eq("user_id", claims.sub);

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 });
    }
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ history: [] });
    }

    // 2. fetch all balance snapshots for those accounts, oldest first
    const accountIds = accounts.map((a) => a.id);
    const { data: snapshots, error: snapshotError } = await supabase
      .from("balance_snapshots")
      .select("account_id, balance, recorded_date")
      .in("account_id", accountIds)
      .order("recorded_date", { ascending: true });

    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }

    // 3. build type map for net worth calculation (assets vs liabilities)
    const typeMap = new Map<string, string>(accounts.map((a) => [a.id, a.type]));

    // 4. group by date and compute net worth per day
    const byDate = new Map<string, number>();
    for (const snap of snapshots ?? []) {
      const type = typeMap.get(snap.account_id);
      const balance = snap.balance ?? 0;
      // credit and loan balances reduce net worth
      const delta =
        type === "credit" || type === "loan" ? -balance : balance;
      byDate.set(snap.recorded_date, (byDate.get(snap.recorded_date) ?? 0) + delta);
    }

    const history = Array.from(byDate.entries()).map(([date, net_worth]) => ({
      date,
      net_worth,
    }));

    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
