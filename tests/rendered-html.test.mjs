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
  assert.match(html, /Добро пожаловать в IceFresh/);
  assert.match(html, /Данные защищены и синхронизируются/);
  assert.match(config, /https:\/\/ogjfqnbgauuhbmauioea\.supabase\.co/);
  assert.doesNotMatch(config, /sb_secret_|service_role\s*:/i);
  assert.equal(JSON.parse(manifest).short_name, "IceFresh");
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
});

test("routes static assets through the security-header worker", async () => {
  const config = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  assert.equal(config.assets?.run_worker_first, true);
});
