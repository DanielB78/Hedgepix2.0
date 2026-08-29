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
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`Invalid ${name}: expected positive integer`);
  }
  return n;
}

export const PROVIDER = "local-pipeline";

export type BackendConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  initialBackfillDays: number;
  syncOverlapDays: number;
};

export function loadConfig(): BackendConfig {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    initialBackfillDays: intEnv("INITIAL_BACKFILL_DAYS", 90),
    syncOverlapDays: intEnv("SYNC_OVERLAP_DAYS", 7),
  };
}
