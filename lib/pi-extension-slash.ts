/**
 * Pi extension slash-command helpers for Telegram routing.
 * Zones: pi agent commands, telegram controls
 * Detects registered Pi extension commands (not prompt templates or skills).
 */

import type { PiSlashCommandInfo } from "./pi.ts";

export interface PiExtensionSlashCommandLine {
  name: string;
  args: string;
}

export function findPiExtensionSlashCommand(
  commandName: string | undefined,
  commands: readonly PiSlashCommandInfo[],
): PiSlashCommandInfo | undefined {
  if (!commandName) return undefined;
  const normalized = commandName.toLowerCase();
  return commands.find(
    (command) =>
      command.source === "extension" &&
      command.name.toLowerCase() === normalized,
  );
}

export function buildPiExtensionSlashLine(
  command: PiExtensionSlashCommandLine,
): string {
  return command.args
    ? `/${command.name} ${command.args}`
    : `/${command.name}`;
}
