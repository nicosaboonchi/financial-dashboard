import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. verify supabase auth and get authenticated user id
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims) {
      return NextResponse.json({ status: 401 });
    }

    const userId = claimsData.claims.sub;

    // 2. get public token from request body
    const { public_token } = await request.json();

    // 3. exchange public token for access token
    const {
      data: { access_token, item_id },
    } = await plaidClient.itemPublicTokenExchange({ public_token });

    // 4. insert into items
    const { data: item, error } = await supabase
      .from("items")
      .insert({
        user_id: userId,
        plaid_access_token: access_token,
        plaid_item_id: item_id,
        status: "connected",
      })
      .select()
      .single();

    // 5. call plaid /accounts/balances/get
    const {
      data: { accounts },
    } = await plaidClient.accountsBalanceGet({ access_token });

    // 6. upsert accounts into the accounts table
    const upsertAccounts = accounts.map((account) => {
      return {
        user_id: userId,
        plaid_account_id: account.account_id,
        name: account.name,
        subtype: account.subtype,
        mask: account.mask,
        iso_currency_code: account.balances.iso_currency_code,
        official_name: account.official_name,
        type: account.type,
        plaid_item_id: item.id,
      };
    });

    const { data, error: upsertError } = await supabase
      .from("accounts")
      .upsert(upsertAccounts, { onConflict: "plaid_account_id" })
      .select();

    // 7. upsert snapshots (one per account per day)

    const today = new Date().toISOString().split("T")[0];

    const balanceSnapshots = data?.map((account) => {
      const plaidAccount = accounts.find(
        (a) => a.account_id === account.plaid_account_id,
      );
      return {
        account_id: account.id,
        balance: plaidAccount?.balances.current,
        recorded_date: today,
      };
    });

    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert(balanceSnapshots, { onConflict: "account_id, recorded_date" });

    // 8. return account deails + balances in response
    const return_data = data?.map((account) => {
      const snapshot = balanceSnapshots?.find(
        (s) => s.account_id === account.id,
      );
      return {
        ...account,
        balance: snapshot?.balance,
      };
    });

    return NextResponse.json({ accounts: return_data });
  } catch {
    return NextResponse.json({ status: 500 });
  }
}
