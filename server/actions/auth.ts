"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/admin";
import { safeAdminRedirect } from "@/lib/auth/safe-redirect";
import { publicEnv } from "@/lib/env";
import type { FormState } from "@/lib/forms";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, newPasswordSchema, signInSchema } from "@/lib/validations/auth";

const GENERIC_SIGN_IN_ERROR = "Email or password is incorrect.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

function fieldErrorsOf(error: z.ZodError): Partial<Record<string, string[]>> {
  return z.flattenError(error).fieldErrors;
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    if (error?.code === "over_request_rate_limit") {
      return { status: "error", message: RATE_LIMITED };
    }
    if (error?.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email address using the link we sent, then sign in.",
      };
    }
    logger.warn("auth.sign_in_failed", { code: error?.code ?? "unknown" });
    return { status: "error", message: GENERIC_SIGN_IN_ERROR };
  }

  // Authentication succeeded; authorization is separate. Only admin_users members keep a session.
  const { data: membership } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!membership) {
    await supabase.auth.signOut({ scope: "local" });
    logger.warn("auth.sign_in_without_role", { userId: data.user.id });
    return { status: "error", message: "This account doesn't have access to the admin area." };
  }

  logger.info("auth.sign_in", { userId: data.user.id });
  redirect(safeAdminRedirect(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login?signed-out=1");
}

export async function requestPasswordReset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/admin/update-password`,
  });
  if (error) {
    // Logged, but never revealed: the response is identical whether or not the account exists.
    logger.warn("auth.password_reset_request_failed", { code: error.code ?? "unknown" });
  }

  return {
    status: "success",
    message:
      "If an admin account exists for that email, a reset link is on its way. It expires in 1 hour.",
  };
}

export async function updatePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const state = await getAuthState();
  if (state.kind === "anonymous") {
    return { status: "error", message: "Your reset link has expired. Please request a new one." };
  }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("auth.update_password_failed", { code: error.code ?? "unknown" });
    switch (error.code) {
      case "same_password":
        return { status: "error", message: "Choose a password you haven't used for this account." };
      case "weak_password":
        return {
          status: "error",
          message: "That password is too weak. Use a longer mix of letters and numbers.",
        };
      case "reauthentication_needed":
        return {
          status: "error",
          message: "For security, request a new reset link and try again.",
        };
      default:
        return { status: "error", message: "We couldn't update your password. Please try again." };
    }
  }

  const userId = state.kind === "authorized" ? state.session.userId : state.userId;
  logger.info("auth.password_updated", { userId });
  redirect("/admin?password-updated=1");
}
