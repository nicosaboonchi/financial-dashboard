"use client";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { fmtCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { PlaidLink } from "@/components/PlaidLink";

type Account = {
  id: string;
  plaid_account_id: string;
  name: string;
  subtype: string;
  mask: string;
  iso_currency_code: string;
  user_id: string;
  current_balance: number;
  display_balance: number;
  is_asset: boolean;
  plaid_items: {
    institution_name: string;
    institution_logo: string;
    institution_color: string;
  };
};
export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("accounts")
      .select(
        `
      *,
      plaid_items (
        institution_name,
        institution_logo,
        institution_color
      )
    `,
      )
      .eq("is_hidden", false)
      .order("created_at");

    if (!error) setAccounts(data ?? []);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1>Financial Dashboard</h1>
      <PlaidLink onSuccess={fetchAccounts} />
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
                    account.current_balance,
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
