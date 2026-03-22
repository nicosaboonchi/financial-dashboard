import { plaidClient } from "@/lib/plaid";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { public_token } = await request.json();

    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    return NextResponse.json({ access_token: response.data.access_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
