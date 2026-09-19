import { NextResponse } from "next/server";
import { searchUniversal } from "@/lib/universalSearch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const tickers = Math.min(
    20,
    Math.max(1, Number(searchParams.get("tickers") ?? 5) || 5),
  );
  const people = Math.min(
    20,
    Math.max(1, Number(searchParams.get("people") ?? 5) || 5),
  );

  try {
    const result = await searchUniversal(q, { tickers, people });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        tickers: [],
        people: [],
        tickerTotal: 0,
        peopleTotal: 0,
        error: err instanceof Error ? err.message : "Search failed",
      },
      { status: 500 },
    );
  }
}
