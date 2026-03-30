import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CountryCode } from "plaid";

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. auth check
  const { data, error } = await supabase.auth.getClaims();

  const user = data?.claims;

  if (error || !user) {
    console.error("Unauthorized access to exchange-token endpoint");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. exchange token
  const { public_token, institution_id, institution_name, link_session_id } =
    await request.json();

  if (!public_token) {
    console.error("Missing public token in request body");
    return NextResponse.json(
      { error: "Missing public token" },
      { status: 400 },
    );
  }

  try {
    console.log("Exchanging public token for access token...");
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = exchangeResponse.data;

    // 3. fetch institution data from Plaid
    console.log("Fetching institution data from Plaid...");
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id,
      country_codes: [CountryCode.Us],
      options: {
        include_optional_metadata: true,
      },
    });

    // 4. store plaid item
    console.log("Storing plaid item in database...");
    const { data: plaidItem, error: plaidItemError } = await supabase
      .from("plaid_items")
      .insert({
        user_id: user.sub,
        item_id: item_id,
        access_token: access_token,
        institution_id: institution_id,
        institution_name: institution_name,
        institution_logo: institutionResponse.data.institution.logo,
        institution_color: institutionResponse.data.institution.primary_color,
        institution_url: institutionResponse.data.institution.url,
        link_session_id: link_session_id,
      })
      .select("id")
      .single();

    if (plaidItemError) {
      console.error("Failed to insert plaid item:", plaidItemError);
      return NextResponse.json(
        { error: "Failed to insert plaid item" },
        { status: 500 },
      );
    }

    // 5. fetch accounts data from Plaid
    console.log("Fetching accounts data from Plaid...");
    const {
      data: { accounts },
    } = await plaidClient.accountsGet({
      access_token,
    });

    // 6. build accounts and snapshots data for insertion
    const today = new Date().toISOString().split("T")[0];

    const accountRows = [];

    for (const account of accounts) {
      const isAsset = !["credit", "loan"].includes(account.type);
      accountRows.push({
        plaid_account_id: account.account_id,
        user_id: user.sub,
        item_id: plaidItem?.id,
        name: account.name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        is_asset: isAsset,
        current_balance: account.balances.current,
        display_balance: Math.abs(account.balances.current ?? 0),
        iso_currency_code: account.balances.iso_currency_code,
        credit_limit: account.balances.limit,
      });
    }

    // 7. insert accounts
    const { data: insertedAccounts, error: accountsError } = await supabase
      .from("accounts")
      .insert(accountRows)
      .select("id, plaid_account_id");

    if (accountsError) {
      console.error("Failed to insert accounts:", accountsError);
      return NextResponse.json(
        { error: "Failed to insert accounts" },
        { status: 500 },
      );
    }

    // 8. build snapshot rows and insert
    const snapshotRows = insertedAccounts.map((account) => {
      const plaidAccount = accounts.find(
        (a) => a.account_id === account.plaid_account_id,
      );
      return {
        account_id: account.id,
        current_balance: plaidAccount?.balances.current,
        display_balance: Math.abs(plaidAccount?.balances.current ?? 0),
        recorded_date: today,
      };
    });

    // 9. insert snapshots
    const { error: snapshotError } = await supabase
      .from("snapshots")
      .insert(snapshotRows);

    if (snapshotError) {
      console.error("Failed to insert snapshots:", snapshotError);
      return NextResponse.json(
        { error: "Failed to insert snapshots" },
        { status: 500 },
      );
    }

    // 10. return accounts
    const { data: returnedAccounts, error: returnedAccountsError } =
      await supabase.from("accounts").select("*");

    if (returnedAccountsError) {
      console.error("Failed to fetch accounts:", returnedAccountsError);
      return NextResponse.json(
        { error: "Failed to fetch accounts" },
        { status: 500 },
      );
    }

    return NextResponse.json({ accounts: returnedAccounts });
  } catch {
    console.error("Failed to exchange public token");
    return NextResponse.json(
      { error: "Failed to exchange public token" },
      { status: 500 },
    );
  }
}
