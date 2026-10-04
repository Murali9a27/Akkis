import { z } from "zod";

/**
 * Email configuration (server only). Business code calls sendEmail() and never touches a
 * provider directly; switching provider means adding an adapter, not editing callers.
 *
 * Supabase Auth emails (invites, password resets) do NOT go through this layer: each
 * Supabase project sends them via its own SMTP settings (Resend SMTP, with a separate API
 * key per project). This layer is for emails the app itself sends.
 */

export const EMAIL_PROVIDERS = ["disabled", "console", "resend"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const recipientList = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email())),
);

const emailEnvSchema = z
  .object({
    EMAIL_PROVIDER: z.preprocess(emptyToUndefined, z.enum(EMAIL_PROVIDERS).default("disabled")),
    EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
    RESEND_API_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^re_[A-Za-z0-9_]+$/, "RESEND_API_KEY must be a Resend API key (re_…)")
        .optional(),
    ),
    EMAIL_ALLOWED_RECIPIENTS: recipientList,
    isProductionDeployment: z.boolean(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["RESEND_API_KEY"],
          message: "Required when EMAIL_PROVIDER=resend.",
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM"],
          message: "Required when EMAIL_PROVIDER=resend.",
        });
      }
    }
  });

export type EmailConfig = Readonly<{
  provider: EmailProvider;
  from: string | undefined;
  resendApiKey: string | undefined;
  /** Only these recipients receive mail outside Vercel Production (empty = none). */
  allowedRecipients: readonly string[];
  isProductionDeployment: boolean;
}>;

export function resolveEmailConfig(env: Record<string, string | undefined>): EmailConfig {
  const parsed = emailEnvSchema.parse({
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,
    EMAIL_FROM: env.EMAIL_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_ALLOWED_RECIPIENTS: env.EMAIL_ALLOWED_RECIPIENTS,
    isProductionDeployment: env.VERCEL_ENV === "production",
  });
  return {
    provider: parsed.EMAIL_PROVIDER,
    from: parsed.EMAIL_FROM,
    resendApiKey: parsed.RESEND_API_KEY,
    allowedRecipients: parsed.EMAIL_ALLOWED_RECIPIENTS,
    isProductionDeployment: parsed.isProductionDeployment,
  };
}

/**
 * Staging safety net: outside Vercel Production, mail only goes to explicitly allowed
 * addresses, so staging can never email real customers.
 */
export function deliverableRecipients(
  recipients: readonly string[],
  config: EmailConfig,
): string[] {
  const normalised = recipients.map((recipient) => recipient.trim().toLowerCase());
  if (config.isProductionDeployment) return normalised;
  return normalised.filter((recipient) => config.allowedRecipients.includes(recipient));
}
