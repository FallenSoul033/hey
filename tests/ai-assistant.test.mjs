import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ai-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const context = {
  organization: "IceFresh",
  sales: { revenue: 100000, received: 75000, receivables: 25000 },
  inventory: [{ product: "Лёд в стакане 250 г", stock: 20, minimumStock: 30 }],
};

function request(token = "valid-token", body = { message: "Что требует внимания?", context }) {
  return new Request("https://icefresh.kz/api/ai-assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("AI endpoint rejects unauthenticated callers before any outbound request", async () => {
  const worker = await loadWorker();
  let calls = 0;
  const response = await worker.fetch(request(""), {
    OPENAI_API_KEY: "test-only-key",
    __TEST_FETCH__: async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    },
  }, {});
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.match(response.headers.get("cache-control"), /no-store|no-cache/);
});

test("AI endpoint rejects active staff members", async () => {
  const worker = await loadWorker();
  let openAICalled = false;
  const response = await worker.fetch(request(), {
    OPENAI_API_KEY: "test-only-key",
    __TEST_FETCH__: async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "staff-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "staff-1", organization_id: "org-1", role: "staff", active: true }]);
      }
      openAICalled = true;
      return new Response(null, { status: 500 });
    },
  }, {});
  assert.equal(response.status, 403);
  assert.equal(openAICalled, false);
});

test("AI endpoint lets an owner request a bounded, non-stored response", async () => {
  const worker = await loadWorker();
  let openAIBody;
  const response = await worker.fetch(request(), {
    OPENAI_API_KEY: "test-only-key",
    __TEST_FETCH__: async (input, init = {}) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "owner-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "owner-1", organization_id: "org-1", role: "owner", active: true }]);
      }
      if (url.includes("/rest/v1/rpc/reserve_ai_request")) return Response.json(true);
      if (url === "https://api.openai.com/v1/responses") {
        openAIBody = JSON.parse(init.body);
        return Response.json({
          output: [{ type: "message", content: [{ type: "output_text", text: "Пополните запас льда в стакане." }] }],
        });
      }
      return new Response(null, { status: 500 });
    },
  }, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Пополните запас льда в стакане." });
  assert.equal(openAIBody.store, false);
  assert.equal(openAIBody.max_output_tokens, 700);
  assert.equal(openAIBody.model, "gpt-5-mini");
  assert.equal(openAIBody.tools, undefined);
  assert.doesNotMatch(JSON.stringify(openAIBody), /test-only-key|valid-token/);
});

test("AI endpoint enforces the persistent hourly limit before calling OpenAI", async () => {
  const worker = await loadWorker();
  let openAICalled = false;
  const response = await worker.fetch(request("valid-token", { message: "Покажи сводку.", context }), {
    OPENAI_API_KEY: "test-only-key",
    __TEST_FETCH__: async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "owner-limit" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "owner-limit", organization_id: "org-limit", role: "owner", active: true }]);
      }
      if (url.includes("/rest/v1/rpc/reserve_ai_request")) return Response.json(false);
      if (url === "https://api.openai.com/v1/responses") openAICalled = true;
      return new Response(null, { status: 500 });
    },
  }, {});
  assert.equal(response.status, 429);
  assert.equal(openAICalled, false);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

test("AI endpoint bounds abusive or unexpectedly large input", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(request("valid-token", { message: "x".repeat(2_000), context }), {
    OPENAI_API_KEY: "test-only-key",
    __TEST_FETCH__: async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "owner-2" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "owner-2", organization_id: "org-1", role: "owner", active: true }]);
      }
      return new Response(null, { status: 500 });
    },
  }, {});
  assert.equal(response.status, 400);
});
