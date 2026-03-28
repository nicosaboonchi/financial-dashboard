"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { fmtCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";

type Account = {
  id: string;
  plaid_account_id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string;
  iso_currency_code: string;
  balance: number | null;
  last_synced_at: string | null;
};

const GROUP_LABELS: Record<string, string> = {
  depository: "Cash",
  credit: "Credit Cards",
  investment: "Investments",
  loan: "Loans",
};

const GROUP_ORDER = ["depository", "credit", "investment", "loan"];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString();
}

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/supabase/accounts");
  const data = await res.json();
  return data.accounts ?? [];
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  async function handleConnectBank() {
    setConnecting(true);
    try {
      const sandboxRes = await fetch("/api/plaid/sandbox-token");
      const { public_token } = await sandboxRes.json();

      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });

      // re-fetch from DB so state stays consistent with the server
      const updated = await fetchAccounts();
      setAccounts(updated);
    } catch (err) {
      console.error("Failed to connect bank account:", err);
    } finally {
      setConnecting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/plaid/sync");
      const updated = await fetchAccounts();
      setAccounts(updated);
    } catch (err) {
      console.error("Failed to refresh accounts:", err);
    } finally {
      setRefreshing(false);
    }
  }

  // net worth: assets minus liabilities
  const assets = accounts
    .filter((a) => a.type === "depository" || a.type === "investment")
    .reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const liabilities = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const netWorth = assets - liabilities;

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    label: GROUP_LABELS[type],
    accounts: accounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  return (
    <main className="max-w-lg mx-auto p-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            {refreshing ? "Refreshing..." : "Refresh all"}
          </Button>
          <Button
            size="sm"
            onClick={handleConnectBank}
            disabled={connecting || loading}
          >
            {connecting ? "Connecting..." : "Add account"}
          </Button>
        </div>
      </div>

      {/* Net worth */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Net Worth</p>
          <p className="text-3xl font-bold">
            {loading ? "—" : fmtCurrency(netWorth, "USD")}
          </p>
        </CardContent>
      </Card>

      {/* Account groups */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading accounts...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts linked yet. Click &quot;Add account&quot; to get started.
        </p>
      ) : (
        grouped.map((group) => {
          const subtotal = group.accounts.reduce(
            (sum, a) => sum + (a.balance ?? 0),
            0
          );
          return (
            <section key={group.type} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </h2>
                <span className="text-sm font-semibold">
                  {fmtCurrency(subtotal, "USD")}
                </span>
              </div>
              <ItemGroup>
                {group.accounts.map((account) => (
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
                          {account.balance !== null
                            ? fmtCurrency(account.balance, account.iso_currency_code)
                            : "—"}
                        </span>
                        <small className="text-muted-foreground text-xs">
                          {account.last_synced_at
                            ? formatRelativeTime(account.last_synced_at)
                            : "never synced"}
                        </small>
                      </div>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          );
        })
      )}
    </main>
  );
}
