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
});
