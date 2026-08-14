import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("redirects the root route to the IceFresh PWA", async () => {
  const response = await render();
  assert.ok([307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/index.html");
});

test("ships the configured Russian IceFresh application", async () => {
  const root = new URL("../public/", import.meta.url);
  const [html, config, manifest, headers] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
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
