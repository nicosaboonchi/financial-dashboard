import { plaidClient } from "@/lib/plaid/plaid";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";

export async function POST() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: data.claims.sub,
      },
      client_name: "Financial Dashboard",
      products: [Products.Auth, Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch {
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 },
    );
  }
}
