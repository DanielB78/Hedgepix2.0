/** Small rounded sector / industry label chips. */

export function SectorChips({
  labels,
  className = "",
  limit,
}: {
  labels: string[];
  className?: string;
  /** Optional max chips before "+N". */
  limit?: number;
}) {
  const clean = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  if (clean.length === 0) return null;

  const shown = typeof limit === "number" ? clean.slice(0, limit) : clean;
  const rest = clean.length - shown.length;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {shown.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-md border border-[color:var(--line)] bg-[color:var(--panel-elevated)] px-2 py-0.5 text-[11px] font-medium leading-tight text-[color:var(--fog-dim)]"
        >
          {label}
        </span>
      ))}
      {rest > 0 ? (
        <span className="inline-flex items-center px-1 text-[11px] text-[color:var(--fog-mute)]">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
