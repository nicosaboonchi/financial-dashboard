import { plaidClient } from "@/lib/plaid/plaid";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    // 1. get authenticated user id from supabase auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // if no authenticated user return 401
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. get all items for the authenticated user from the supabase items table
    const { data: items, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", user.id);
    if (error) {
      console.error("Failed to fetch items from database:", error);
      return NextResponse.json(
        { error: "Failed to fetch items" },
        { status: 500 },
      );
    }

    // 3. get account balances
    for (const item of items) {
      const { data: accounts } = await plaidClient.accountsBalanceGet({
        access_token: item.plaid_access_token,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
