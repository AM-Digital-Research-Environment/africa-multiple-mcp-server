import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { BRIDGE_JS } from "../../server/lib.js";

test("MCP App accepts results and initialization only from its parent frame", async () => {
  const listeners = new Set();
  const sent = [];
  const parent = { postMessage: (message) => sent.push(message) };
  const window = {
    parent,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const attrs = {};
  vm.runInNewContext(BRIDGE_JS, {
    window, document: { documentElement: { setAttribute: (key, value) => { attrs[key] = value; } } },
  });
  const received = [];
  window.amiraApp.onResult((result) => received.push(result));
  const emit = (source, data) => { for (const fn of [...listeners]) fn({ source, data }); };
  const reply = { id: sent[0].id, result: { hostContext: { theme: "dark" } } };
  emit({}, reply);
  await Promise.resolve();
  assert.equal(attrs["data-theme"], undefined);
  emit(parent, reply);
  await Promise.resolve();
  assert.equal(attrs["data-theme"], "dark");
  const result = { method: "ui/notifications/tool-result", params: { structuredContent: { count: 562 } } };
  emit({}, result);
  assert.equal(received.length, 0);
  emit(parent, result);
  assert.equal(received[0].count, 562);
});
