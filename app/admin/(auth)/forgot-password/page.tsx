import type { Metadata } from "next";
import Link from "next/link";
import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { ForgotPasswordForm } from "@/components/admin/auth/ForgotPasswordForm";
import styles from "@/components/admin/auth/forms.module.css";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const expired = firstParam(params.error) === "link-expired";

  return (
    <>
      <h1 className={styles.heading}>Reset your password</h1>
      <p className={styles.intro}>Enter your admin email and we&apos;ll send you a reset link.</p>
      {expired ? (
        <AuthNotice tone="error">Your reset link has expired. Please request a new one.</AuthNotice>
      ) : null}
      <ForgotPasswordForm />
      <p className={styles.links}>
        <Link href="/admin/login">Back to sign in</Link>
      </p>
    </>
  );
}
