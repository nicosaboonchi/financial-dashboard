import { decrypt } from "@/lib/crypto";
import { plaidClient } from "@/lib/plaid/plaid";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. verify auth
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. get item_id from request body (never accept access_token from client)
    const { item_id } = await request.json();

    // 3. look up access token server-side, scoped to this user
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("plaid_access_token")
      .eq("id", item_id)
      .eq("user_id", claims.sub)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // 4. fetch transactions from Plaid
    const response = await plaidClient.transactionsSync({
      access_token: decrypt(item.plaid_access_token),
    });

    return NextResponse.json({ transactions: response.data.added });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
