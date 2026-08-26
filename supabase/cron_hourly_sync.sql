-- Hourly ingestion via pg_cron + pg_net (Supabase).
-- Apply AFTER the Edge Function is deployed and secrets are set.
-- Replace PROJECT_REF and YOUR_SERVICE_ROLE_KEY before running.

-- Enable extensions (Supabase Dashboard → Database → Extensions if needed)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Schedule hourly sync (minute 0 of every hour)
-- Unschedule first if re-applying:
--   select cron.unschedule('sync-congress-trades-hourly');

select cron.schedule(
  'sync-congress-trades-hourly',
  '0 * * * *',
  $$
  select
    net.http_post(
      url := 'https://PROJECT_REF.supabase.co/functions/v1/sync-congress-trades',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object('mode', 'hourly')
    ) as request_id;
  $$
);
