export type FollowTargetType = "ticker" | "member";

export type FollowTarget = {
  type: FollowTargetType;
  key: string;
  label: string;
  followedAt: string;
};

export function normalizeFollows(raw: unknown): FollowTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: FollowTarget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    if ((type !== "ticker" && type !== "member") || !key) continue;
    out.push({
      type,
      key: type === "ticker" ? key.toUpperCase() : key.toLowerCase(),
      label:
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim()
          : key,
      followedAt:
        typeof row.followedAt === "string"
          ? row.followedAt
          : new Date().toISOString(),
    });
  }
  return out;
}

export function isFollowing(
  follows: FollowTarget[],
  type: FollowTargetType,
  key: string,
): boolean {
  const normalized =
    type === "ticker" ? key.trim().toUpperCase() : key.trim().toLowerCase();
  return follows.some((f) => f.type === type && f.key === normalized);
}

export function toggleFollow(
  follows: FollowTarget[],
  type: FollowTargetType,
  key: string,
  label: string,
): FollowTarget[] {
  const normalized =
    type === "ticker" ? key.trim().toUpperCase() : key.trim().toLowerCase();
  if (isFollowing(follows, type, normalized)) {
    return follows.filter((f) => !(f.type === type && f.key === normalized));
  }
  return [
    ...follows,
    {
      type,
      key: normalized,
      label: label.trim() || normalized,
      followedAt: new Date().toISOString(),
    },
  ];
}
