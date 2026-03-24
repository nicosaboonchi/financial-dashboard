import { plaidClient } from "@/lib/plaid/plaid";
import { supabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const access_token = process.env.PLAID_SANDBOX_ACCESS_TOKEN!;

    const response = await plaidClient.accountsBalanceGet({ access_token });
    const accounts = response.data.accounts;

    const mappedAccounts = accounts.map((account) => ({
      plaid_account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      iso_currency_code: account.balances.iso_currency_code,
      user_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("accounts")
      .upsert(mappedAccounts, { onConflict: "plaid_account_id" })
      .select();

    console.log(error);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const accountLookup = data.reduce(
      (acc, account) => {
        acc[account.plaid_account_id] = account.id;
        return acc;
      },
      {} as Record<string, string>,
    );

    const mappedSnapshots = accounts?.map((account) => ({
      account_id: accountLookup[account.account_id],
      balance: account.balances.current,
      recorded_at: new Date().toISOString(),
    }));

    const { data: snapshots, error: snapshotsError } = await supabase
      .from("balance_snapshots")
      .upsert(mappedSnapshots, {
        onConflict: "account_id,recorded_date",
        ignoreDuplicates: false,
      })
      .select();

    console.log("snapshots:", snapshots);
    console.log("snapshotsError:", snapshotsError);

    if (snapshotsError) {
      return NextResponse.json(
        { error: snapshotsError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { accounts: data, snapshots: snapshots },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
