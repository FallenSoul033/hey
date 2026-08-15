import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async (request) =>
          new URL(request.url).pathname === "/app-shell.html"
            ? new Response("IceFresh application shell", {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              })
            : new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("serves the IceFresh PWA shell through the security worker", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "IceFresh application shell");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("ships the configured Russian IceFresh application", async () => {
  const root = new URL("../public/", import.meta.url);
  const [html, config, manifest, headers] = await Promise.all([
    readFile(new URL("app-shell.html", root), "utf8"),
    readFile(new URL("config.js", root), "utf8"),
    readFile(new URL("manifest.webmanifest", root), "utf8"),
    readFile(new URL("_headers", root), "utf8"),
  ]);
  assert.match(html, /Чистый лёд[\s\S]*для бизнеса и дома/);
  assert.match(html, /Оставить заявку/);
  assert.match(html, /Вход для сотрудников/);
  assert.match(html, /Добро пожаловать в IceFresh/);
  assert.match(html, /Данные защищены и синхронизируются/);
  assert.match(config, /https:\/\/ogjfqnbgauuhbmauioea\.supabase\.co/);
  assert.doesNotMatch(config, /sb_secret_|service_role\s*:/i);
  assert.equal(JSON.parse(manifest).short_name, "IceFresh");
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
});

test("keeps public enquiries separate from protected CRM records", async () => {
  const root = new URL("../", import.meta.url);
  const [app, routes, migration, edgeFunction] = await Promise.all([
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/routes.js", root), "utf8"),
    readFile(new URL("supabase/migrations/202608150001_website_requests.sql", root), "utf8"),
    readFile(new URL("supabase/functions/public-order-request/index.ts", root), "utf8"),
  ]);

  assert.match(routes, /return route \|\| 'home'/);
  assert.match(routes, /screen: 'public'/);
  assert.match(app, /functions\/v1\/public-order-request/);
  assert.match(app, /from\('website_requests'\)/);
  assert.match(app, /if \(route\(\) !== 'home'\) replaceRoute\('login'\)/);
  assert.doesNotMatch(app, /service_role|sb_secret_/i);
  assert.match(migration, /alter table public\.website_requests enable row level security/);
  assert.match(migration, /revoke all privileges on table public\.website_requests from anon, authenticated/);
  assert.match(migration, /grant select \(/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete)[^;]* to anon/i);
  assert.match(edgeFunction, /ALLOWED_ORIGINS/);
  assert.match(edgeFunction, /RATE_LIMIT_PER_HOUR = 5/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("ships owner controls, product photos, and the operations calendar securely", async () => {
  const root = new URL("../", import.meta.url);
  const [app, routes, migration, headers, edgeFunction] = await Promise.all([
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/routes.js", root), "utf8"),
    readFile(new URL("supabase/migrations/202608150002_admin_catalog_calendar.sql", root), "utf8"),
    readFile(new URL("public/_headers", root), "utf8"),
    readFile(new URL("supabase/functions/public-order-request/index.ts", root), "utf8"),
  ]);

  assert.match(routes, /'calendar'/);
  assert.match(routes, /'products'/);
  assert.match(app, /from\('schedule_items'\)/);
  assert.match(app, /storage\.from\(PRODUCT_IMAGE_BUCKET\)\.upload/);
  assert.match(app, /rpc\('manage_member'/);
  assert.match(app, /Доступ к системе/);
  assert.match(migration, /alter table public\.schedule_items enable row level security/);
  assert.match(migration, /create policy products_manage/);
  assert.match(migration, /bucket_id = 'product-images'/);
  assert.match(migration, /revoke execute on function public\.manage_member/);
  assert.match(headers, /img-src 'self' data: https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(edgeFunction, /const PRODUCT_IDS/);
  assert.match(edgeFunction, /from\("products"\)/);
});

test("routes static assets through the security-header worker", async () => {
  const config = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  assert.equal(config.assets?.run_worker_first, true);
});
