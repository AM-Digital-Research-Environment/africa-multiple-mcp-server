import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Resolve through MCPB's actual dependency chain so this checks the scoped
// override, even when npm installs other copies elsewhere in node_modules.
const require = createRequire(import.meta.url);
const mcpbRequire = createRequire(require.resolve("@anthropic-ai/mcpb"));
const promptsRequire = createRequire(mcpbRequire.resolve("@inquirer/prompts"));
const editorRequire = createRequire(promptsRequire.resolve("@inquirer/editor"));
const externalEditorPath = editorRequire.resolve("external-editor");
const externalRequire = createRequire(externalEditorPath);
const { ExternalEditor } = externalRequire(externalEditorPath);
const tmp = externalRequire("tmp");

test("MCPB's editor can create, read and clean up a file with the patched tmp", () => {
  const editor = new ExternalEditor("initial text", {
    prefix: "amira-packaging-", postfix: ".txt", mode: 0o600,
  });
  try {
    assert.ok(path.basename(editor.tempFile).startsWith("amira-packaging-"));
    assert.ok(editor.tempFile.endsWith(".txt"));
    assert.equal(readFileSync(editor.tempFile, "utf8"), "initial text");
    writeFileSync(editor.tempFile, "edited text — é", "utf8");
    editor.readTemporaryFile();
    assert.equal(editor.text, "edited text — é");
  } finally {
    editor.cleanup();
  }
  assert.equal(existsSync(editor.tempFile), false);
});

test("MCPB's tmp rejects traversal and non-string path options", () => {
  for (const option of ["prefix", "postfix", "template"]) {
    assert.throws(() => tmp.tmpNameSync({ [option]: `..${path.sep}escape-XXXXXX` }), Error);
    assert.throws(() => tmp.tmpNameSync({ [option]: ["..", "escape-XXXXXX"] }), Error);
  }
});
