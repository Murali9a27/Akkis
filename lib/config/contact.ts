import { z } from "zod";

/**
 * Business contact details, configured per environment (never hardcoded in code).
 * These are public information shown on the site and used in tel:/wa.me/mailto: links,
 * so they are NEXT_PUBLIC_* values — not secrets. Validated on first use.
 *
 * Set in .env.local (local) and in Vercel (Preview + Production).
 */

const e164 = z
  .string({ error: "is required" })
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, "must be in international format, e.g. +919876543210");

const contactSchema = z.object({
  NEXT_PUBLIC_CONTACT_PHONE: e164,
  NEXT_PUBLIC_WHATSAPP_NUMBER: e164,
  NEXT_PUBLIC_CONTACT_EMAIL: z
    .string({ error: "is required" })
    .trim()
    .toLowerCase()
    .pipe(z.email("must be a valid email address")),
});

export type ContactConfig = Readonly<{
  /** E.164, e.g. "+919876543210" — for tel: links. */
  phone: string;
  /** Human-readable, e.g. "+91 98765 43210". */
  phoneDisplay: string;
  /** E.164 of the WhatsApp Business number. */
  whatsapp: string;
  email: string;
}>;

/** "+919876543210" → "+91 98765 43210" (Indian numbers); other numbers are returned as-is. */
export function formatPhoneForDisplay(e164Number: string): string {
  const indian = e164Number.match(/^\+91(\d{5})(\d{5})$/);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : e164Number;
}

export function resolveContactConfig(env: Record<string, string | undefined>): ContactConfig {
  const parsed = contactSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`[contact config] ${problems}. Set these in .env.local / Vercel.`);
  }
  const { NEXT_PUBLIC_CONTACT_PHONE, NEXT_PUBLIC_WHATSAPP_NUMBER, NEXT_PUBLIC_CONTACT_EMAIL } =
    parsed.data;
  return {
    phone: NEXT_PUBLIC_CONTACT_PHONE,
    phoneDisplay: formatPhoneForDisplay(NEXT_PUBLIC_CONTACT_PHONE),
    whatsapp: NEXT_PUBLIC_WHATSAPP_NUMBER,
    email: NEXT_PUBLIC_CONTACT_EMAIL,
  };
}

let cached: ContactConfig | undefined;

export function getContactConfig(): ContactConfig {
  cached ??= resolveContactConfig({
    // Literal references so Next.js inlines them into the browser bundle.
    NEXT_PUBLIC_CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE,
    NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  });
  return cached;
}

/** wa.me deep link to the business number, with the message safely URL-encoded. */
export function whatsappLink(whatsappE164: string, message?: string): string {
  const base = `https://wa.me/${whatsappE164.replace(/^\+/, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
