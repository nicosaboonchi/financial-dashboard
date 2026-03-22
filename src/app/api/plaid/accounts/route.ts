import { plaidClient } from "@/lib/plaid";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { access_token } = await request.json();

    const response = await plaidClient.accountsBalanceGet({ access_token });
    const accounts = response.data.accounts;
    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
