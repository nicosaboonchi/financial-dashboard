import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";

export async function POST() {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: claims.sub },
      client_name: "Financial Dashboard",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
