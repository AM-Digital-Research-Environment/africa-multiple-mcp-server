import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { writeSnapshot, SNAPSHOT_SCHEMA_VERSION } from "../../server/lib.js";
import { buildFixture } from "../fixtures/fixture-data.mjs";

test("HTTP health recovers after an initially unavailable snapshot becomes readable", { timeout: 15000 }, async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "amira-http-"));
  const data = path.join(tmp, "data");
  const child = spawn(process.execPath, ["server/http.js"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", AMIRA_LIVE_REFRESH: "0",
      AMIRA_DATA_DIR: data, AMIRA_CACHE_DIR: path.join(tmp, "cache") },
    windowsHide: true, stdio: ["ignore", "ignore", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (chunk) => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await fs.rm(tmp, { recursive: true, force: true });
  });
  // PORT=0 uses an OS-selected port, avoiding parallel-test collisions.
  let base;
  for (let i = 0; i < 100; i++) {
    base = logs.match(/on (http:\/\/127\.0\.0\.1:\d+)\/mcp/)?.[1];
    if (base && logs.includes("initial data load failed")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(base, logs);
  const failed = await fetch(`${base}/healthz`);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).status, "error");
  await writeSnapshot(data, buildFixture(SNAPSHOT_SCHEMA_VERSION));
  const client = new Client({ name: "http-recovery-test", version: "0.0.0" });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const result = await client.callTool({ name: "get_collection_overview", arguments: {} });
  assert.equal(result.isError, undefined);
  const recovered = await fetch(`${base}/healthz`);
  assert.equal(recovered.status, 200);
  const body = await recovered.json();
  assert.equal(body.status, "ok");
  assert.equal(body.error, undefined);
  assert.equal(body.data_snapshot.publications, 2);
});
