import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { firstParam, type SearchParams } from "@/lib/search-params";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminHomePage({ searchParams }: { searchParams: SearchParams }) {
  // Checked again here: layouts don't re-run on every navigation, so pages must not rely on them.
  const session = await requireAdmin();
  const params = await searchParams;

  return (
    <>
      {firstParam(params["password-updated"]) ? (
        <p role="status" className={styles.notice}>
          Your password has been updated.
        </p>
      ) : null}
      <h1 className={styles.heading}>Welcome</h1>
      <p>
        Signed in as <strong>{session.email}</strong> ({session.role}).
      </p>
      <p className={styles.muted}>
        Orders, products, gallery and blog management arrive in a later phase.
      </p>
    </>
  );
}
