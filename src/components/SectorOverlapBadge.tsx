"use client";

import { useId, useState } from "react";
import type { SectorOverlapResult } from "@/lib/sectorOverlap";

/**
 * Subtle "Sector overlap" badge with explanatory tooltip.
 * Heuristic only — not a legal/ethics finding.
 */
export function SectorOverlapBadge({
  overlap,
}: {
  overlap: SectorOverlapResult | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  if (!overlap?.has_sector_overlap) return null;

  const matchLabel =
    overlap.match_type === "direct"
      ? "Direct"
      : overlap.match_type === "embedding"
        ? "Semantic"
        : "—";

  const similarityText =
    overlap.match_type === "embedding" &&
    typeof overlap.similarity === "number"
      ? overlap.similarity.toFixed(3)
      : null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--fog-dim)] hover:border-[color:var(--mint)]/40 hover:text-[color:var(--fog)]"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        title="Sector overlap"
      >
        Sector overlap
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-2.5 text-left text-[11px] leading-relaxed text-[color:var(--fog)] shadow-[var(--shadow-soft)]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold text-[color:var(--fog)]">Sector overlap</p>
          <p className="mt-1 text-[color:var(--fog-dim)]">
            Committee-linked industry exposure matches a traded ticker&apos;s
            industry. This is a heuristic, not proof of wrongdoing.
          </p>
          {overlap.member_label ? (
            <p className="mt-1.5">
              <span className="text-[color:var(--fog-dim)]">Member sector: </span>
              {overlap.member_label}
            </p>
          ) : null}
          {overlap.ticker_label ? (
            <p>
              <span className="text-[color:var(--fog-dim)]">Ticker sector: </span>
              {overlap.ticker_label}
            </p>
          ) : null}
          <p>
            <span className="text-[color:var(--fog-dim)]">Match: </span>
            {matchLabel}
          </p>
          {similarityText ? (
            <p>
              <span className="text-[color:var(--fog-dim)]">Similarity: </span>
              {similarityText}
            </p>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
