// Node 20 does not expand test globs. Enumerate files instead of depending on
// the invoking shell (npm uses cmd.exe on Windows and sh on Unix).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suite = process.argv[2] ?? "unit";
if (!["unit", "live"].includes(suite)) throw new Error(`Unknown test suite: ${suite}`);
const dir = new URL(`../test/${suite}/`, import.meta.url);
const files = readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort()
  .map((name) => fileURLToPath(new URL(name, dir)));
if (!files.length) throw new Error(`No tests found in ${suite}`);
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
