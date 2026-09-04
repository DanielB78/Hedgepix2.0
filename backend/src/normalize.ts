export function memberSlug(member: string): string {
  return member
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function amountRange(
  low: number | null,
  high: number | null,
): string | null {
  if (low === null && high === null) return null;
  if (low !== null && high === null) return `Over $${low.toLocaleString("en-US")}`;
  if (low !== null && high !== null && low === high) {
    return `$${low.toLocaleString("en-US")}`;
  }
  if (low !== null && high !== null) {
    return `$${low.toLocaleString("en-US")} - $${high.toLocaleString("en-US")}`;
  }
  return null;
}
