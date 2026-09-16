import { NextResponse } from "next/server";
import {
  fetchMemberPreview,
  fetchMemberStockPreview,
  fetchStockPreview,
} from "@/lib/feed";
import { parseChartTradeSource } from "@/lib/chartTrades";
import {
  fetchMemberBuysWithReturns,
  fetchOfficerBuysWithReturns,
  parsePerformerPeriod,
} from "@/lib/topPerformers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");

  try {
    if (kind === "stock") {
      const ticker = searchParams.get("ticker") ?? "";
      const sourceRaw =
        searchParams.get("source") ?? searchParams.get("chamber") ?? "congress";
      const mapped =
        sourceRaw === "all"
          ? "congress"
          : sourceRaw === "house" ||
              sourceRaw === "senate" ||
              sourceRaw === "ceo" ||
              sourceRaw === "both" ||
              sourceRaw === "congress"
            ? sourceRaw
            : "congress";
      const tradeSource = parseChartTradeSource(mapped);
      const data = await fetchStockPreview(ticker, tradeSource);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    if (kind === "member") {
      const slug = searchParams.get("slug") ?? "";
      const data = await fetchMemberPreview(slug);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    if (kind === "member-stock") {
      const slug = searchParams.get("slug") ?? "";
      const ticker = searchParams.get("ticker") ?? "";
      const data = await fetchMemberStockPreview(slug, ticker);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    if (kind === "member-buys") {
      const slug = searchParams.get("slug") ?? "";
      const period = parsePerformerPeriod(searchParams.get("perf") ?? undefined);
      const data = await fetchMemberBuysWithReturns(slug, period);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    if (kind === "officer-buys") {
      const name = searchParams.get("name") ?? "";
      const period = parsePerformerPeriod(searchParams.get("perf") ?? undefined);
      const data = await fetchOfficerBuysWithReturns(name, period);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
