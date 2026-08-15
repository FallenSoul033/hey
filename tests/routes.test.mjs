import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadRoutes() {
  const source = await readFile(new URL("../public/routes.js", import.meta.url), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.IceRoutes;
}

const guest = { authenticated: false, onboarded: false, role: null, active: false };
const staff = { authenticated: true, onboarded: true, role: "staff", active: true };
const admin = { authenticated: true, onboarded: true, role: "admin", active: true };
const owner = { authenticated: true, onboarded: true, role: "owner", active: true };

test("the empty URL is the public IceFresh site", async () => {
  const routes = await loadRoutes();
  assert.equal(routes.parseHash(""), "home");
  assert.deepEqual(
    structuredClone(routes.resolve("home", guest)),
    { screen: "public", route: "home" },
  );
});

test("CRM routes remain protected while enquiries are available to staff", async () => {
  const routes = await loadRoutes();
  assert.deepEqual(
    structuredClone(routes.resolve("orders", guest)),
    { screen: "auth", route: "login" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("requests", staff)),
    { screen: "app", route: "requests" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("calendar", staff)),
    { screen: "app", route: "calendar" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("products", staff)),
    { screen: "app", route: "dashboard" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("products", owner)),
    { screen: "app", route: "products" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("ai", staff)),
    { screen: "app", route: "ai" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("ai", admin)),
    { screen: "app", route: "ai" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("ai", owner)),
    { screen: "app", route: "ai" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("integrations", staff)),
    { screen: "app", route: "dashboard" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("integrations", admin)),
    { screen: "app", route: "dashboard" },
  );
  assert.deepEqual(
    structuredClone(routes.resolve("integrations", owner)),
    { screen: "app", route: "integrations" },
  );
});
