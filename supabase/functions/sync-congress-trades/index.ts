/**
 * DEPRECATED — Bargo Edge Function sync.
 *
 * Use the local backend updater instead:
 *   cd backend && npm run update-data
 *
 * This file is retained only for historical reference and should not be deployed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve((_req) => {
  return new Response(
    JSON.stringify({
      ok: false,
      error:
        "Deprecated. Use backend `npm run update-data` (local congress-trading-pipeline updater).",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
});

// Silence unused import while keeping the file as a Deno edge stub.
void createClient;
