import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCik } from "./identifiers.js";

export type FollowedInvestor = {
  name: string;
  cik: string;
  note?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadFollowedInvestors(): FollowedInvestor[] {
  const path = resolve(__dirname, "../../config/followed-investors.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as FollowedInvestor[];
  return Array.isArray(raw) ? raw : [];
}

export function followedCikSet(): Set<string> {
  return new Set(loadFollowedInvestors().map((i) => normalizeCik(i.cik)));
}

export const FOLLOWED_INVESTORS = loadFollowedInvestors();
