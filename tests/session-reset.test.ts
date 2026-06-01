/**
 * Regression tests for /compact-all session reset helpers
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  handleTelegramSessionResetCommand,
  resetSessionFile,
} from "../lib/session-reset.ts";

test("resetSessionFile writes minimal session tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-telegram-reset-"));
  const sessionFile = join(dir, "session.jsonl");
  const header = {
    type: "session",
    version: 3,
    id: "abc123",
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: "/tmp/work",
  };
  const old = `${JSON.stringify(header)}\n${JSON.stringify({ type: "message", id: "x" })}\n`;
  writeFileSync(sessionFile, old, "utf8");

  const result = resetSessionFile(sessionFile, {
    provider: "cursor",
    model: "composer-2.5",
    thinking: "off",
    cwd: "/tmp/work",
    greeting: "",
  });
  assert.equal(result.ok, true);

  const lines = readFileSync(sessionFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.type, "session");
  assert.equal(parsed.id, "abc123");
  assert.equal(JSON.parse(lines[1]!).type, "model_change");
  assert.equal(JSON.parse(lines[2]!).type, "thinking_level_change");
});

test("handleTelegramSessionResetCommand resets file then reloads", async () => {
  const events: string[] = [];
  await handleTelegramSessionResetCommand(
    { id: "ctx" },
    {
      getSessionContext: () => ({
        sessionFile: "/tmp/session.jsonl",
        cwd: "/Users/dennis",
        provider: "cursor",
        model: "composer-2.5",
        thinking: "off",
      }),
      resetSessionFile: (sessionFile, options) => {
        events.push(
          `reset:${sessionFile}:${options.provider}:${options.model}`,
        );
        return { ok: true };
      },
      reloadSession: async () => {
        events.push("reload");
        return true;
      },
      isIdle: () => true,
      sendTextReply: async (text) => {
        events.push(`reply:${text}`);
      },
    },
  );
  assert.deepEqual(events, [
    "reset:/tmp/session.jsonl:cursor:composer-2.5",
    "reload",
    "reply:New session — context cleared. Send your next message to start fresh.",
  ]);
});
