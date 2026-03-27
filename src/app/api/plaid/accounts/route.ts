import { plaidClient } from "@/lib/plaid/plaid";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    // 1. get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. get all items for the user
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    // 3. for each item call accountsBalanceGet endpoint using the access token
    for (const item of data) {
      const response = await plaidClient.accountsBalanceGet({
        access_token: item.plaid_access_token,
      });

      console.log("Plaid accounts balance response:", response.data);
    }
    // 4. upsert the accounts and snapshots in the database
    // 5. return the accounts and snapshots from the database
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
