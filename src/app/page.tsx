"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { fmtCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  plaid_account_id: string;
  name: string;
  subtype: string;
  mask: string;
  iso_currency_code: string;
  user_id: string;
  balance: number;
};

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleConnectBank() {
    setLoading(true);
    try {
      // 1. call the api route to create a sandbox public token
      const res = await fetch("/api/plaid/sandbox-token");
      const data = await res.json();
      const public_token = data.public_token;

      // 2. call the api route to exchange the public token for an access token and store it in the database
      const { accounts } = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public_token }),
      }).then((res) => res.json());
      setAccounts(accounts);
    } catch (err) {
      console.error("Failed to connect bank account:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1>Financial Dashboard</h1>
      <Button variant="outline" onClick={handleConnectBank} disabled={loading}>
        {loading ? "Connecting..." : "Connect your bank account"}
      </Button>
      <h2>Accounts:</h2>
      <ItemGroup>
        {accounts?.map((account) => (
          <Item variant="muted" key={account.plaid_account_id}>
            <ItemContent className="flex flex-row items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <ItemTitle className="items-baseline gap-1">
                  {account.name}
                  <small className="text-muted-foreground text-xs">
                    (...{account.mask})
                  </small>
                </ItemTitle>
                <ItemDescription className="capitalize">
                  {account.subtype}
                </ItemDescription>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-semibold">
                  {fmtCurrency(account.balance, account.iso_currency_code)}
                </span>
                <small className="text-muted-foreground text-xs">
                  Available Balance
                </small>
              </div>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </main>
  );
}
