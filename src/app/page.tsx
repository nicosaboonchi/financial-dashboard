"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AccountBase } from "plaid";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountBase[]>([]);

  const handleConnectBank = async () => {
    try {
      // Step 1: Get the public token from the backend
      const publicTokenResponse = await fetch("/api/plaid/sandbox-token");
      const { public_token } = await publicTokenResponse.json();

      // Step 2: Exchange the public token for an access token
      const exchangeResponse = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public_token }),
      });
      const { access_token } = await exchangeResponse.json();

      // Store the access token in state (or context)
      setAccessToken(access_token);

      const accountsResponse = await fetch("/api/plaid/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token }),
      });
      const { accounts } = await accountsResponse.json();
      setAccounts(accounts);
    } catch (err) {
      console.error("Error connecting bank account:", err);
    }
  };

  const fmtCurrency = (amount: number | null, currency: string | null) => {
    if (amount === null || currency === null) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  return (
    <main className="max-w-lg mx-auto">
      <h1>Financial Dashboard</h1>
      <Button variant="outline" onClick={handleConnectBank}>
        Connect your bank account
      </Button>
      <p>Access Token: {accessToken}</p>
      <h2>Accounts:</h2>
      <ItemGroup>
        {accounts.map((account) => (
          <Item variant="muted" key={account.account_id}>
            <ItemContent>
              <ItemTitle>{account.name}</ItemTitle>
              <ItemDescription>
                {fmtCurrency(
                  account.balances.current,
                  account.balances.iso_currency_code,
                )}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </main>
  );
}
