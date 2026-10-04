import "server-only";

import type { EmailConfig } from "@/lib/email/config";

type ResendPayload = Readonly<{
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}>;

/** Resend adapter (REST API; no SDK dependency). Returns the Resend message id. */
export async function sendWithResend(
  config: EmailConfig,
  payload: ResendPayload,
): Promise<string | null> {
  if (!config.resendApiKey || !config.from) {
    throw new Error("Resend is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      reply_to: payload.replyTo,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Resend responded with HTTP ${response.status}.`);
  }
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body !== null && "id" in body && typeof body.id === "string"
    ? body.id
    : null;
}
