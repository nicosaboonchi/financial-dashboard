import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Get the public token from the request body
    const { public_token } = await request.json();

    // 2. Get the authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Received public token:", public_token);

    // 3. Exchange the public token for an access token
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    const { access_token, item_id } = response.data;

    console.log("Plaid exchange response:", response.data);

    // 4. Insert into the database linked to the user
    const { error: dbError } = await supabase.from("items").insert({
      user_id: user.id,
      plaid_access_token: access_token,
      plaid_item_id: item_id,
      status: "active",
    });

    if (dbError) throw new Error(dbError.message);

    // 5. Return success with the item id
    return NextResponse.json({ item_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
