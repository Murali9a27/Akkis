import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeAdminRedirect } from "@/lib/auth/safe-redirect";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Email link types this app sends (see supabase/templates). Everything else is rejected. */
const ALLOWED_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "email",
  "email_change",
]);

function isAllowedType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_TYPES.has(value as EmailOtpType);
}

/**
 * Target of Supabase auth emails: exchanges a one-time token hash for a session, then
 * continues to an allow-listed /admin path. Token-hash links work across devices and
 * email clients (unlike PKCE code links).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeAdminRedirect(searchParams.get("next"));

  if (tokenHash && isAllowedType(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
    logger.warn("auth.confirm_failed", { type, code: error.code ?? "unknown" });
  }

  redirect("/admin/login?error=link-invalid");
}
