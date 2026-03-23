import { supabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { data: accounts, error } = await supabase.from("accounts").select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ accounts });
}
