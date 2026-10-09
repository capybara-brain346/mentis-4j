import { CONFIG } from "../config/config.js";
import { getLogLevel } from "../config/environment.js";

type Level = keyof typeof CONFIG.logging.levels;

function log(level: Level, message: string, requestId?: string): void {
  const threshold = CONFIG.logging.levels[getLogLevel()];
  if (CONFIG.logging.levels[level] < threshold) return;
  const entry = `${JSON.stringify({ level, message, ...(requestId ? { request_id: requestId } : {}) })}\n`;
  if (typeof process.stderr?.write === "function") process.stderr.write(entry);
  else console.error(entry.trimEnd());
}

export const logger = {
  debug: (message: string, requestId?: string): void =>
    log("debug", message, requestId),
  info: (message: string, requestId?: string): void =>
    log("info", message, requestId),
  error: (message: string, requestId?: string): void =>
    log("error", message, requestId),
};
