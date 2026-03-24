"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AccountBase, Transaction } from "plaid";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { fmtCurrency } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Account = {
  id: string;
  plaid_account_id: string;
  name: string;
  subtype: string;
  mask: string;
  iso_currency_code: string;
  user_id: string;
};

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<
    { account_id: string; balance: number }[]
  >([]);

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
      const { accounts, snapshots } = await accountsResponse.json();
      setAccounts(accounts);
      setSnapshots(snapshots);
    } catch (error) {
      console.error("Error connecting bank account:", error);
    }
  };

  const handleRefresh = async () => {
    const response = await fetch("/api/plaid/accounts", {
      method: "POST",
    });
    const { accounts, snapshots } = await response.json();
    setAccounts(accounts);
    setSnapshots(snapshots);
  };

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1>Financial Dashboard</h1>
      <Button variant="outline" onClick={handleConnectBank}>
        Connect your bank account
      </Button>
      <Button variant="outline" onClick={handleRefresh} className="ml-2">
        Refresh Balances
      </Button>
      <p>Access Token: {accessToken}</p>
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
                  {fmtCurrency(
                    snapshots.find((s) => s.account_id === account.id)
                      ?.balance || 0,
                    account.iso_currency_code,
                  )}
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
