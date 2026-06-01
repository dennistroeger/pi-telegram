/**
 * Full session reset for Telegram /compact-all.
 * Zones: telegram controls, pi session files
 * Rewrites the current Pi session JSONL to a minimal tree (like a new chat).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const DEFAULT_GREETING =
  "New session — context cleared. What should we work on?";

export interface SessionResetWriteOptions {
  provider: string;
  model: string;
  thinking: string;
  cwd: string;
  greeting?: string;
}

interface SessionHeader {
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
}

function entryId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function readHeader(sessionFile: string): SessionHeader | undefined {
  let raw: string;
  try {
    raw = readFileSync(sessionFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const first = raw.split("\n")[0];
  if (!first) return undefined;
  const value = JSON.parse(first) as { type?: string };
  if (value.type !== "session") return undefined;
  return {
    version: typeof value.version === "number" ? value.version : 3,
    id: typeof value.id === "string" ? value.id : "",
    timestamp: typeof value.timestamp === "string" ? value.timestamp : "",
    cwd: typeof value.cwd === "string" ? value.cwd : "",
  };
}

export function resetSessionFile(
  sessionFile: string,
  options: SessionResetWriteOptions,
): { ok: boolean; error?: string } {
  try {
    const header = readHeader(sessionFile);
    const now = new Date().toISOString();
    const cwd = options.cwd || header?.cwd || process.cwd();
    const sessionId =
      header?.id && header.id.length > 0 ? header.id : randomUUID();
    const version = header?.version ?? 3;
    const timestamp =
      header?.timestamp && header.timestamp.length > 0
        ? header.timestamp
        : now;
    const greeting = options.greeting ?? DEFAULT_GREETING;

    const lines: string[] = [];
    lines.push(
      JSON.stringify({
        type: "session",
        version,
        id: sessionId,
        timestamp,
        cwd,
      }),
    );

    const modelEntryId = entryId();
    lines.push(
      JSON.stringify({
        type: "model_change",
        id: modelEntryId,
        parentId: null,
        timestamp: now,
        provider: options.provider,
        modelId: options.model,
      }),
    );

    const thinkEntryId = entryId();
    lines.push(
      JSON.stringify({
        type: "thinking_level_change",
        id: thinkEntryId,
        parentId: modelEntryId,
        timestamp: now,
        thinkingLevel: options.thinking,
      }),
    );

    if (greeting.length > 0) {
      const msgId = entryId();
      const tsMs = Date.now();
      lines.push(
        JSON.stringify({
          type: "message",
          id: msgId,
          parentId: thinkEntryId,
          timestamp: now,
          message: {
            role: "assistant",
            content: [{ type: "text", text: greeting }],
            api: "cursor-sdk",
            provider: options.provider,
            model: options.model,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: "stop",
            timestamp: tsMs,
          },
        }),
      );
    }

    writeFileSync(sessionFile, `${lines.join("\n")}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export interface TelegramSessionResetContext {
  sessionFile?: string;
  cwd: string;
  provider: string;
  model: string;
  thinking: string;
}

export interface TelegramSessionResetCommandDeps<TContext> {
  getSessionContext: (ctx: TContext) => TelegramSessionResetContext;
  resetSessionFile: (
    sessionFile: string,
    options: SessionResetWriteOptions,
  ) => { ok: boolean; error?: string };
  reloadSession: () => Promise<boolean>;
  abortCurrentTurn?: () => void;
  isIdle: (ctx: TContext) => boolean;
  sendTextReply: (text: string) => Promise<void>;
}

const SUCCESS_REPLY =
  "New session — context cleared. Send your next message to start fresh.";

export async function handleTelegramSessionResetCommand<TContext>(
  ctx: TContext,
  deps: TelegramSessionResetCommandDeps<TContext>,
): Promise<void> {
  if (!deps.isIdle(ctx)) {
    deps.abortCurrentTurn?.();
  }

  const session = deps.getSessionContext(ctx);
  if (!session.sessionFile) {
    const reloaded = await deps.reloadSession();
    if (reloaded) {
      await deps.sendTextReply(SUCCESS_REPLY);
      return;
    }
    await deps.sendTextReply(
      "No session file — π could not start a new session.",
    );
    return;
  }

  const written = deps.resetSessionFile(session.sessionFile, {
    provider: session.provider,
    model: session.model,
    thinking: session.thinking,
    cwd: session.cwd,
  });
  if (!written.ok) {
    await deps.sendTextReply(written.error ?? "Session reset failed.");
    return;
  }

  const reloaded = await deps.reloadSession();
  if (!reloaded) {
    await deps.sendTextReply(
      "Session file reset. Reload unavailable — restart π or run /reload in the TUI.",
    );
    return;
  }

  await deps.sendTextReply(SUCCESS_REPLY);
}
