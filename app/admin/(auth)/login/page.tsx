import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { LoginForm } from "@/components/admin/auth/LoginForm";
import styles from "@/components/admin/auth/forms.module.css";
import { getAuthState } from "@/lib/auth/admin";
import { safeAdminRedirect } from "@/lib/auth/safe-redirect";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { signOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "not-authorized": "This account doesn't have access to the admin area.",
  "link-invalid": "That link is invalid or has expired. Please request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeAdminRedirect(firstParam(params.next));
  const state = await getAuthState();

  if (state.kind === "authorized") {
    redirect(next);
  }

  const error = ERRORS[firstParam(params.error) ?? ""];

  return (
    <>
      <h1 className={styles.heading}>Sign in</h1>
      <p className={styles.intro}>For Akki&apos;s Healthy Baking staff only.</p>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      {firstParam(params["signed-out"]) ? (
        <AuthNotice tone="info">You have been signed out.</AuthNotice>
      ) : null}

      {state.kind === "signed-in-without-role" ? (
        <form action={signOut} className={styles.form}>
          <p className={styles.intro}>
            You are signed in with an account that isn&apos;t an admin.
          </p>
          <button type="submit" className={styles.button}>
            Sign out
          </button>
        </form>
      ) : (
        <LoginForm next={next} />
      )}

      <p className={styles.links}>
        <Link href="/admin/forgot-password">Forgot your password?</Link>
      </p>
    </>
  );
}
