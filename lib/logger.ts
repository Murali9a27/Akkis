type Level = "info" | "warn" | "error";

/**
 * Minimal structured logger (JSON lines → Vercel Logs). Never pass PII: no emails, phone
 * numbers, addresses, message bodies or passwords — log ids and error codes instead.
 */
function log(level: Level, event: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, context?: Record<string, unknown>) => log("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => log("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => log("error", event, context),
};
