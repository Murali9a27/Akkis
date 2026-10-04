import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/components/admin/auth/UpdatePasswordForm";
import styles from "@/components/admin/auth/forms.module.css";
import { getAuthState } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "Set password" };

/** Reached from an invite or recovery email (via /auth/confirm), which creates a session. */
export default async function UpdatePasswordPage() {
  const state = await getAuthState();
  if (state.kind === "anonymous") {
    redirect("/admin/forgot-password?error=link-expired");
  }

  return (
    <>
      <h1 className={styles.heading}>Choose a password</h1>
      <p className={styles.intro}>You&apos;ll use it to sign in to the admin area.</p>
      <UpdatePasswordForm />
    </>
  );
}
