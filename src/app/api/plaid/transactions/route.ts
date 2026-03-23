import { plaidClient } from "@/lib/plaid/plaid";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { access_token } = await request.json();

    const response = await plaidClient.transactionsSync({ access_token });
    const transactions = response.data.added;
    return NextResponse.json({ transactions });
  } catch (err) {
    // right
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
