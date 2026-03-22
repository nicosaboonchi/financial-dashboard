import { plaidClient } from "@/lib/plaid";
import { NextResponse } from "next/server";
import { Products } from "plaid";

export async function GET() {
  try {
    const response = await plaidClient.sandboxPublicTokenCreate({
      institution_id: "ins_109508",
      initial_products: [Products.Transactions],
    });

    return NextResponse.json({ public_token: response.data.public_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
