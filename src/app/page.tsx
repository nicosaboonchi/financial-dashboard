"use client";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
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
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type HistoryPoint = { date: string; net_worth: number };

type Period = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  depository: "Cash",
  credit: "Credit Cards",
  investment: "Investments",
  loan: "Loans",
};

const GROUP_ORDER = ["depository", "credit", "investment", "loan"];

const PERIODS: Period[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

const chartConfig = {
  net_worth: { label: "Net Worth", color: "hsl(var(--chart-1, 174 72% 56%))" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString();
}

function filterByPeriod(history: HistoryPoint[], period: Period): HistoryPoint[] {
  if (period === "ALL") return history;
  const now = new Date();
  let cutoff: Date;
  if (period === "1M") cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  else if (period === "3M") cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  else if (period === "6M") cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  else if (period === "YTD") cutoff = new Date(now.getFullYear(), 0, 1);
  else cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); // 1Y
  const cutoffStr = cutoff.toISOString().split("T")[0];
  return history.filter((p) => p.date >= cutoffStr);
}

function formatXAxisDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function loadAccounts(): Promise<Account[]> {
  const res = await fetch("/api/supabase/accounts");
  const data = await res.json();
  return data.accounts ?? [];
}

async function loadHistory(): Promise<HistoryPoint[]> {
  const res = await fetch("/api/supabase/net-worth-history");
  const data = await res.json();
  return data.history ?? [];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("1M");
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Load accounts + history on mount
  useEffect(() => {
    Promise.all([loadAccounts(), loadHistory()])
      .then(([accts, hist]) => {
        setAccounts(accts);
        setHistory(hist);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Plaid Link ──────────────────────────────────────────────────────────

  const onPlaidSuccess = useCallback(
    async (public_token: string) => {
      setConnecting(true);
      setLinkToken(null);
      try {
        await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token }),
        });
        const [accts, hist] = await Promise.all([loadAccounts(), loadHistory()]);
        setAccounts(accts);
        setHistory(hist);
      } catch (err) {
        console.error("Failed to exchange token:", err);
      } finally {
        setConnecting(false);
      }
    },
    []
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  // Open Link as soon as the token is ready
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function handleConnectBank() {
    setConnecting(true);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const { link_token, error } = await res.json();
      if (error) throw new Error(error);
      setLinkToken(link_token);
    } catch (err) {
      console.error("Failed to create link token:", err);
      setConnecting(false);
    }
    // connecting stays true until onPlaidSuccess finishes
  }

  // ── Refresh ─────────────────────────────────────────────────────────────

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/plaid/sync");
      const [accts, hist] = await Promise.all([loadAccounts(), loadHistory()]);
      setAccounts(accts);
      setHistory(hist);
    } catch (err) {
      console.error("Failed to refresh:", err);
    } finally {
      setRefreshing(false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

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

  const chartData = filterByPeriod(history, period);

  const yMin = chartData.length
    ? Math.floor(Math.min(...chartData.map((p) => p.net_worth)) * 0.98)
    : 0;
  const yMax = chartData.length
    ? Math.ceil(Math.max(...chartData.map((p) => p.net_worth)) * 1.02)
    : 1;

  // ── Render ───────────────────────────────────────────────────────────────

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

      {/* Net worth + chart */}
      <Card>
        <CardContent className="pt-4 pb-2 flex flex-col gap-4">
          {/* Net worth total */}
          <div>
            <p className="text-sm text-muted-foreground">Net Worth</p>
            <p className="text-3xl font-bold">
              {loading ? "—" : fmtCurrency(netWorth, "USD")}
            </p>
          </div>

          {/* Area chart */}
          {chartData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-40 w-full">
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-net_worth)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-net_worth)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatXAxisDate}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    `$${Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v}`
                  }
                  width={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        fmtCurrency(Number(value), "USD")
                      }
                      labelFormatter={formatXAxisDate}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="net_worth"
                  stroke="var(--color-net_worth)"
                  strokeWidth={2}
                  fill="url(#netWorthGradient)"
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          )}

          {/* Period filter */}
          {history.length > 0 && (
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 rounded text-xs py-1 transition-colors ${
                    period === p
                      ? "bg-foreground text-background font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account groups */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
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
