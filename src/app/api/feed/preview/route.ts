import { NextResponse } from "next/server";
import {
  fetchMemberPreview,
  fetchMemberStockPreview,
  fetchStockPreview,
} from "@/lib/feed";
import type { Chamber } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");

  try {
    if (kind === "stock") {
      const ticker = searchParams.get("ticker") ?? "";
      const chamberRaw = searchParams.get("chamber") ?? "all";
      const chamber =
        chamberRaw === "house" || chamberRaw === "senate"
          ? (chamberRaw as Chamber)
          : "all";
      const data = await fetchStockPreview(ticker, chamber);
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

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
