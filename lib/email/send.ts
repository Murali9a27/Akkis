import "server-only";

import { deliverableRecipients, resolveEmailConfig, type EmailConfig } from "@/lib/email/config";
import { sendWithResend } from "@/lib/email/resend";
import { logger } from "@/lib/logger";

export type EmailMessage = Readonly<{
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}>;

export type SendResult =
  | { status: "sent"; id: string | null }
  | { status: "suppressed"; reason: "disabled" | "no-allowed-recipients" }
  | { status: "logged" }
  | { status: "failed" };

let cachedConfig: EmailConfig | undefined;
function config(): EmailConfig {
  cachedConfig ??= resolveEmailConfig(process.env);
  return cachedConfig;
}

/** Provider-neutral entry point for every email the app sends. Never throws on delivery failure. */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const cfg = config();

  if (cfg.provider === "disabled") {
    return { status: "suppressed", reason: "disabled" };
  }

  const to = deliverableRecipients(message.to, cfg);
  if (to.length === 0) {
    logger.info("email.suppressed", { reason: "no-allowed-recipients", subject: message.subject });
    return { status: "suppressed", reason: "no-allowed-recipients" };
  }

  if (cfg.provider === "console") {
    logger.info("email.console", { recipients: to.length, subject: message.subject });
    return { status: "logged" };
  }

  try {
    const id = await sendWithResend(cfg, { ...message, to });
    logger.info("email.sent", { provider: "resend", id });
    return { status: "sent", id };
  } catch (error) {
    logger.error("email.failed", { provider: "resend", message: (error as Error).message });
    return { status: "failed" };
  }
}
