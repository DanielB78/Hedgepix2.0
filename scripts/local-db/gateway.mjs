#!/usr/bin/env node
/**
 * Tiny gateway so @supabase/supabase-js can talk to local PostgREST.
 *
 * Supabase clients call:
 *   {SUPABASE_URL}/rest/v1/<table>
 *   {SUPABASE_URL}/auth/v1/...
 *
 * PostgREST serves tables at /<table>. Auth is stubbed (no GoTrue).
 */
import http from "node:http";

const GATEWAY_PORT = Number(process.env.LOCAL_GATEWAY_PORT || 54321);
const POSTGREST_PORT = Number(process.env.LOCAL_POSTGREST_PORT || 54322);
const POSTGREST_HOST = process.env.LOCAL_POSTGREST_HOST || "127.0.0.1";

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(data),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  });
  res.end(data);
}

function proxyToPostgrest(req, res, targetPath) {
  const headers = { ...req.headers, host: `${POSTGREST_HOST}:${POSTGREST_PORT}` };
  const upstream = http.request(
    {
      hostname: POSTGREST_HOST,
      port: POSTGREST_PORT,
      path: targetPath,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    sendJson(res, 502, { message: `PostgREST proxy error: ${err.message}` });
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  if (url.startsWith("/rest/v1")) {
    const restPath = url.slice("/rest/v1".length) || "/";
    proxyToPostgrest(req, res, restPath);
    return;
  }

  // Auth stubs — enough for the app to boot without GoTrue.
  if (url.startsWith("/auth/v1/health")) {
    sendJson(res, 200, { version: "local-stub", name: "GoTrueStub" });
    return;
  }
  if (url.startsWith("/auth/v1/settings")) {
    sendJson(res, 200, {
      external: {},
      disable_signup: true,
      mailer_autoconfirm: false,
    });
    return;
  }
  if (url.startsWith("/auth/v1/")) {
    sendJson(res, 501, {
      message:
        "Local auth is not enabled. Use cloud Supabase for login, or browse public pages without signing in.",
    });
    return;
  }

  // Convenience: also expose PostgREST at root for curl debugging.
  proxyToPostgrest(req, res, url);
});

server.listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(
    `Local Supabase gateway on http://127.0.0.1:${GATEWAY_PORT} → PostgREST :${POSTGREST_PORT}`,
  );
});
