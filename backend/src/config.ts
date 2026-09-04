import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid ${name}: expected non-negative integer`);
  }
  return n;
}

/** Ongoing updater provider (InsiderWatch CSV). */
export const INSIDERWATCH_PROVIDER = "insiderwatch";

/** Historical backfill provider (Kadoa dataset). */
export const KADOA_PROVIDER = "kadoa";

/** @deprecated Use INSIDERWATCH_PROVIDER for update-data. */
export const PROVIDER = INSIDERWATCH_PROVIDER;

export type BackendConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Days to subtract from last_success_at when filtering filed_date. */
  insiderwatchOverlapDays: number;
  /** Lookback window when no InsiderWatch sync exists yet. */
  insiderwatchInitialDays: number;
};

export function loadConfig(): BackendConfig {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    insiderwatchOverlapDays: intEnv("INSIDERWATCH_OVERLAP_DAYS", 3),
    insiderwatchInitialDays: intEnv("INSIDERWATCH_INITIAL_DAYS", 14),
  };
}
